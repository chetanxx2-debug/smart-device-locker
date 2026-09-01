package com.tigerlocker.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

class LockActivity : AppCompatActivity() {

    private lateinit var tvLockMessage: TextView
    private lateinit var tvLockDetails: TextView
    private lateinit var btnCallRetailer: Button
    private lateinit var btnEmergencyDialer: Button

    private val unlockReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == "com.tigerlocker.app.ACTION_UNLOCK") {
                finish()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Setup lockscreen window flags
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_lock)

        hideSystemUI()

        tvLockMessage = findViewById(R.id.tvLockMessage)
        tvLockDetails = findViewById(R.id.tvLockDetails)
        btnCallRetailer = findViewById(R.id.btnCallRetailer)
        btnEmergencyDialer = findViewById(R.id.btnEmergencyDialer)

        val message = intent.getStringExtra("LOCK_MESSAGE") ?: "Your monthly EMI is overdue. Please contact the retailer."
        val deviceId = intent.getStringExtra("DEVICE_ID") ?: "DEV-LOCKED"

        tvLockMessage.text = message
        tvLockDetails.text = "Device: $deviceId | Tiger Locker Security Active"

        val prefs = getSharedPreferences("TigerLockerPrefs", Context.MODE_PRIVATE)
        val retailerPhone = prefs.getString("retailer_phone", "+919876543210")

        btnCallRetailer.setOnClickListener {
            val callIntent = Intent(Intent.ACTION_DIAL).apply {
                data = Uri.parse("tel:$retailerPhone")
            }
            startActivity(callIntent)
        }

        btnEmergencyDialer.setOnClickListener {
            val emergencyIntent = Intent(Intent.ACTION_DIAL).apply {
                data = Uri.parse("tel:112")
            }
            startActivity(emergencyIntent)
        }

        // Block Back Button
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Ignore back press while device is locked
            }
        })

        // Register unlock broadcast listener
        val filter = IntentFilter("com.tigerlocker.app.ACTION_UNLOCK")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(unlockReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(unlockReceiver, filter)
        }
    }

    private fun hideSystemUI() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let {
                it.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
            )
        }
    }

    override fun onResume() {
        super.onResume()
        hideSystemUI()
        try {
            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as? android.app.admin.DevicePolicyManager
            if (dpm != null && dpm.isDeviceOwnerApp(packageName)) {
                startLockTask()
            }
        } catch (e: Exception) {
            // Ignore if lock task not permitted
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        // If user tries to press Home/Recents on non-kiosk devices, immediately bring LockActivity back to front
        val prefs = getSharedPreferences("TigerLockerPrefs", Context.MODE_PRIVATE)
        val isLocked = prefs.getBoolean("is_locked", true)
        if (isLocked) {
            val lockIntent = Intent(this, LockActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            }
            startActivity(lockIntent)
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideSystemUI()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            stopLockTask()
        } catch (e: Exception) {
            // Ignore
        }
        try {
            unregisterReceiver(unlockReceiver)
        } catch (e: Exception) {
            // Ignore
        }
    }
}
