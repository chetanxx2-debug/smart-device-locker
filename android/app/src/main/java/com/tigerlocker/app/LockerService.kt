package com.tigerlocker.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.widget.Toast
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class LockerService : Service() {

    private val serviceJob = Job()
    private val scope = CoroutineScope(Dispatchers.IO + serviceJob)
    private var webSocket: WebSocket? = null
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    private lateinit var devicePolicyManager: DevicePolicyManager
    private lateinit var adminComponent: ComponentName

    private var serverUrl: String = ""
    private var deviceId: String = ""
    private var isLocked: Boolean = false

    companion object {
        const val CHANNEL_ID = "TigerLockerServiceChannel"
        const val NOTIFICATION_ID = 1001
    }

    override fun onCreate() {
        super.onCreate()
        devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        adminComponent = ComponentName(this, LockerAdminReceiver::class.java)

        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildForegroundNotification("Tiger Locker Protection is Active"))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val prefs = getSharedPreferences("TigerLockerPrefs", Context.MODE_PRIVATE)
        serverUrl = prefs.getString("server_url", "") ?: ""
        deviceId = prefs.getString("device_id", "") ?: ""

        if (serverUrl.isNotEmpty() && deviceId.isNotEmpty()) {
            connectWebSocket()
            startHeartbeatPolling()
        }

        return START_STICKY
    }

    private fun connectWebSocket() {
        if (serverUrl.isEmpty()) return

        val wsUrl = serverUrl.replace("http://", "ws://").replace("https://", "wss://")
        val request = Request.Builder().url(wsUrl).build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                // Register Device on WebSocket
                val authPayload = JSONObject().apply {
                    put("type", "AUTH")
                    put("deviceId", deviceId)
                    put("battery", DeviceUtils.getBatteryLevel(this@LockerService))
                    put("network", DeviceUtils.getNetworkType(this@LockerService))
                }
                webSocket.send(authPayload.toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleIncomingMessage(text)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                // Reconnect after delay
                scope.launch {
                    delay(5000)
                    connectWebSocket()
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                scope.launch {
                    delay(5000)
                    connectWebSocket()
                }
            }
        })
    }

    private fun handleIncomingMessage(jsonString: String) {
        try {
            val json = JSONObject(jsonString)
            val type = json.optString("type")

            Handler(Looper.getMainLooper()).post {
                when (type) {
                    "LOCK" -> {
                        val message = json.optString("message", "Device is Locked due to pending EMI.")
                        applyLock(message)
                    }
                    "UNLOCK" -> {
                        removeLock()
                    }
                    "SIREN" -> {
                        SirenManager.startSiren(this@LockerService)
                    }
                    "STOP_SIREN" -> {
                        SirenManager.stopSiren()
                    }
                    "MESSAGE" -> {
                        val msg = json.optString("message", "Notice from Seller")
                        Toast.makeText(this@LockerService, "🐅 ADMIN MESSAGE:\n$msg", Toast.LENGTH_LONG).show()
                    }
                    "WIPE_DATA" -> {
                        if (devicePolicyManager.isAdminActive(adminComponent)) {
                            devicePolicyManager.wipeData(0)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun applyLock(message: String) {
        isLocked = true

        val prefs = getSharedPreferences("TigerLockerPrefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("is_locked", true).apply()

        // Set lock task packages if device owner
        try {
            if (devicePolicyManager.isDeviceOwnerApp(packageName)) {
                devicePolicyManager.setLockTaskPackages(adminComponent, arrayOf(packageName))
            }
        } catch (e: Exception) {
            // Ignore
        }

        // Lock screen immediately if admin is enabled
        if (devicePolicyManager.isAdminActive(adminComponent)) {
            devicePolicyManager.lockNow()
        }

        // Launch Persistent Fullscreen Lock Activity
        val lockIntent = Intent(this, LockActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra("LOCK_MESSAGE", message)
            putExtra("DEVICE_ID", deviceId)
        }
        startActivity(lockIntent)
    }

    private fun removeLock() {
        isLocked = false
        val prefs = getSharedPreferences("TigerLockerPrefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("is_locked", false).apply()

        SirenManager.stopSiren()
        val unlockIntent = Intent("com.tigerlocker.app.ACTION_UNLOCK")
        sendBroadcast(unlockIntent)
        Toast.makeText(this, "Device unlocked successfully!", Toast.LENGTH_SHORT).show()
    }

    private fun startHeartbeatPolling() {
        scope.launch {
            while (isActive) {
                try {
                    // Send WebSocket heartbeat
                    val heartbeat = JSONObject().apply {
                        put("type", "HEARTBEAT")
                        put("deviceId", deviceId)
                        put("battery", DeviceUtils.getBatteryLevel(this@LockerService))
                        put("network", DeviceUtils.getNetworkType(this@LockerService))
                        put("isLocked", isLocked)
                    }
                    webSocket?.send(heartbeat.toString())

                    // HTTP Fallback polling check
                    if (serverUrl.isNotEmpty() && deviceId.isNotEmpty()) {
                        val pollRequest = Request.Builder()
                            .url("$serverUrl/api/devices/$deviceId/poll")
                            .build()
                        client.newCall(pollRequest).execute().use { response ->
                            if (response.isSuccessful) {
                                val body = response.body?.string()
                                if (!body.isNullOrEmpty()) {
                                    val json = JSONObject(body)
                                    val serverIsLocked = json.optBoolean("isLocked", false)
                                    val sirenActive = json.optBoolean("sirenActive", false)
                                    val msg = json.optString("message", "")

                                    Handler(Looper.getMainLooper()).post {
                                        if (serverIsLocked && !isLocked) {
                                            applyLock(msg)
                                        } else if (!serverIsLocked && isLocked) {
                                            removeLock()
                                        }

                                        if (sirenActive) {
                                            SirenManager.startSiren(this@LockerService)
                                        } else {
                                            SirenManager.stopSiren()
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    // Network error / offline
                }
                delay(10000) // Poll every 10 seconds
            }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Tiger Locker Protection Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(content: String): Notification {
        val notificationIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Tiger Locker Active")
            .setContentText(content)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceJob.cancel()
        webSocket?.close(1000, "Service destroyed")
        SirenManager.stopSiren()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
