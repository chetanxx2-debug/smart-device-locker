package com.tigerlocker.app

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var btnEnableAdmin: Button
    private lateinit var btnEnableOverlay: Button
    private lateinit var etServerUrl: TextInputEditText
    private lateinit var etPairCode: TextInputEditText
    private lateinit var btnPairDevice: Button
    private lateinit var tvStatusHeader: TextView
    private lateinit var tvDeviceInfo: TextView

    private lateinit var devicePolicyManager: DevicePolicyManager
    private lateinit var adminComponent: ComponentName

    private val httpClient = OkHttpClient()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        adminComponent = ComponentName(this, LockerAdminReceiver::class.java)

        initViews()
        loadSavedConfig()
        checkPermissionsState()
    }

    private fun initViews() {
        btnEnableAdmin = findViewById(R.id.btnEnableAdmin)
        btnEnableOverlay = findViewById(R.id.btnEnableOverlay)
        etServerUrl = findViewById(R.id.etServerUrl)
        etPairCode = findViewById(R.id.etPairCode)
        btnPairDevice = findViewById(R.id.btnPairDevice)
        tvStatusHeader = findViewById(R.id.tvStatusHeader)
        tvDeviceInfo = findViewById(R.id.tvDeviceInfo)

        btnEnableAdmin.setOnClickListener {
            if (!devicePolicyManager.isAdminActive(adminComponent)) {
                val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                    putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
                    putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "Tiger Locker requires Device Admin to enforce EMI security policies.")
                }
                startActivity(intent)
            } else {
                Toast.makeText(this, "Device Admin is already active!", Toast.LENGTH_SHORT).show()
            }
        }

        btnEnableOverlay.setOnClickListener {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (!Settings.canDrawOverlays(this)) {
                    val intent = Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName")
                    )
                    startActivity(intent)
                } else {
                    Toast.makeText(this, "Overlay permission is already granted!", Toast.LENGTH_SHORT).show()
                }
            }
        }

        btnPairDevice.setOnClickListener {
            val serverUrl = etServerUrl.text.toString().trim()
            val pairCode = etPairCode.text.toString().trim()

            if (serverUrl.isEmpty()) {
                Toast.makeText(this, "Please enter Backend Server URL", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (pairCode.length != 6) {
                Toast.makeText(this, "Please enter a valid 6-digit Pair Code", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            performPairing(serverUrl, pairCode)
        }
    }

    private fun loadSavedConfig() {
        val prefs = getSharedPreferences("TigerLockerPrefs", Context.MODE_PRIVATE)
        val savedServerUrl = prefs.getString("server_url", "http://192.168.1.10:3000")
        val savedPairCode = prefs.getString("pair_code", "")
        val isPaired = prefs.getBoolean("is_paired", false)
        val deviceId = prefs.getString("device_id", "Not Paired")

        etServerUrl.setText(savedServerUrl)
        etPairCode.setText(savedPairCode)

        if (isPaired) {
            tvStatusHeader.text = "Device Status: Protected & Online"
            tvDeviceInfo.text = "Device ID: $deviceId\nBattery: ${DeviceUtils.getBatteryLevel(this)}%\nNetwork: ${DeviceUtils.getNetworkType(this)}\nModel: ${DeviceUtils.getDeviceModel()}"
            startLockerService()
        }
    }

    private fun checkPermissionsState() {
        val isAdmin = devicePolicyManager.isAdminActive(adminComponent)
        val isOverlay = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Settings.canDrawOverlays(this) else true

        if (isAdmin) {
            btnEnableAdmin.text = "✓ Device Admin Active"
            btnEnableAdmin.isEnabled = false
        }

        if (isOverlay) {
            btnEnableOverlay.text = "✓ Overlay Permission Granted"
            btnEnableOverlay.isEnabled = false
        }
    }

    private fun performPairing(serverUrl: String, pairCode: String) {
        btnPairDevice.isEnabled = false
        btnPairDevice.text = "Pairing with Server..."

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val jsonPayload = JSONObject().apply {
                    put("pairCode", pairCode)
                    put("imei", DeviceUtils.getDeviceIdentifier(this@MainActivity))
                    put("deviceModel", DeviceUtils.getDeviceModel())
                }

                val body = jsonPayload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
                val cleanUrl = if (serverUrl.endsWith("/")) serverUrl.substring(0, serverUrl.length - 1) else serverUrl
                val request = Request.Builder()
                    .url("$cleanUrl/api/devices/pair")
                    .post(body)
                    .build()

                val response = httpClient.newCall(request).execute()
                val responseString = response.body?.string()

                withContext(Dispatchers.Main) {
                    btnPairDevice.isEnabled = true
                    btnPairDevice.text = "Pair & Activate Protection"

                    if (response.isSuccessful && responseString != null) {
                        val respJson = JSONObject(responseString)
                        val deviceId = respJson.optString("deviceId", "DEV-ACTIVE")

                        // Save to preferences
                        val prefs = getSharedPreferences("TigerLockerPrefs", Context.MODE_PRIVATE)
                        prefs.edit()
                            .putString("server_url", cleanUrl)
                            .putString("pair_code", pairCode)
                            .putString("device_id", deviceId)
                            .putBoolean("is_paired", true)
                            .apply()

                        tvStatusHeader.text = "Device Status: Protected & Online"
                        tvDeviceInfo.text = "Device ID: $deviceId\nBattery: ${DeviceUtils.getBatteryLevel(this@MainActivity)}%\nNetwork: ${DeviceUtils.getNetworkType(this@MainActivity)}\nModel: ${DeviceUtils.getDeviceModel()}"

                        Toast.makeText(this@MainActivity, "Device Paired Successfully!", Toast.LENGTH_LONG).show()

                        startLockerService()
                    } else {
                        Toast.makeText(this@MainActivity, "Pairing Failed: Invalid code or Server unreachable", Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    btnPairDevice.isEnabled = true
                    btnPairDevice.text = "Pair & Activate Protection"
                    Toast.makeText(this@MainActivity, "Error connecting to server: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun startLockerService() {
        val serviceIntent = Intent(this, LockerService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }
    }

    override fun onResume() {
        super.onResume()
        checkPermissionsState()
    }
}
