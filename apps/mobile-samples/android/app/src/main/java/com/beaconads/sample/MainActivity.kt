package com.beaconads.sample

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {
    private lateinit var settings: AppSettings
    private lateinit var log: TextView
    private val executor = Executors.newSingleThreadExecutor()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        settings = AppSettings(this)
        log = findViewById(R.id.log)

        val serverUrl = findViewById<EditText>(R.id.serverUrl).apply { setText(settings.serverUrl) }
        val apiKey = findViewById<EditText>(R.id.apiKey).apply { setText(settings.apiKey) }
        val companyId = findViewById<EditText>(R.id.companyId).apply { setText(settings.companyIdHex) }
        val testBeacon = findViewById<EditText>(R.id.testBeacon).apply { setText(settings.testBeaconId) }

        findViewById<Button>(R.id.save).setOnClickListener {
            settings.serverUrl = serverUrl.text.toString()
            settings.apiKey = apiKey.text.toString()
            settings.companyIdHex = companyId.text.toString()
            append("Settings saved. Device token: ${settings.deviceToken.take(8)}…")
        }

        findViewById<Button>(R.id.permissions).setOnClickListener {
            val permissions = buildList {
                add(Manifest.permission.ACCESS_FINE_LOCATION)
                if (Build.VERSION.SDK_INT >= 31) add(Manifest.permission.BLUETOOTH_SCAN)
                if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
            }
            requestPermissions(permissions.toTypedArray(), REQUEST_FOREGROUND)
        }

        findViewById<Button>(R.id.backgroundPermission).setOnClickListener {
            if (!granted(Manifest.permission.ACCESS_FINE_LOCATION)) {
                append("Grant step 1 first.")
            } else {
                // Android shows "Allow all the time" on a separate settings screen.
                requestPermissions(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION), REQUEST_BACKGROUND)
            }
        }

        findViewById<Button>(R.id.startScan).setOnClickListener {
            val missing = listOfNotNull(
                Manifest.permission.ACCESS_FINE_LOCATION.takeUnless { granted(it) },
                Manifest.permission.BLUETOOTH_SCAN.takeIf { Build.VERSION.SDK_INT >= 31 && !granted(it) },
            )
            if (missing.isNotEmpty()) append("Missing permissions: ${missing.joinToString()}")
            else append(BeaconScanner.start(this))
            if (!granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION)) append("Without step 2, beacons are only detected while the app is open.")
        }

        findViewById<Button>(R.id.stopScan).setOnClickListener { append(BeaconScanner.stop(this)) }

        findViewById<Button>(R.id.test).setOnClickListener {
            val beaconId = testBeacon.text.toString().trim().lowercase()
            settings.testBeaconId = beaconId
            if (beaconId.isEmpty()) return@setOnClickListener append("Enter a station beacon UUID.")
            append("Fetching campaigns for $beaconId…")
            executor.execute {
                val outcome = runCatching { CampaignNotifier(applicationContext).handleDetection(beaconId, null, rssi = -55, test = true) }
                    .getOrElse { "Error: ${it.message}" }
                runOnUiThread { append(outcome) }
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val summary = permissions.zip(grantResults.toTypedArray()).joinToString { (p, r) ->
            "${p.substringAfterLast('.')}=${if (r == PackageManager.PERMISSION_GRANTED) "granted" else "denied"}"
        }
        append(summary)
    }

    private fun granted(permission: String) = ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private fun append(message: String) {
        val time = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss"))
        log.text = "[$time] $message\n${log.text}"
    }

    companion object {
        private const val REQUEST_FOREGROUND = 1
        private const val REQUEST_BACKGROUND = 2
    }
}
