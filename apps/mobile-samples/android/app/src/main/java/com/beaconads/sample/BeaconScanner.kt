package com.beaconads.sample

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent

/**
 * Background BLE scanning with a PendingIntent: Android delivers matching advertisements to
 * [BeaconScanReceiver] even when the app is not running. Filters are required for screen-off scans.
 */
object BeaconScanner {
    private const val REQUEST_CODE = 42

    private fun pendingIntent(context: Context, flags: Int) = PendingIntent.getBroadcast(
        context,
        REQUEST_CODE,
        Intent(context, BeaconScanReceiver::class.java).setAction(BeaconScanReceiver.ACTION),
        flags or PendingIntent.FLAG_MUTABLE,
    )

    @SuppressLint("MissingPermission") // Permissions are checked by MainActivity before calling.
    fun start(context: Context): String {
        val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter ?: return "This device has no Bluetooth adapter."
        if (!adapter.isEnabled) return "Turn on Bluetooth first."
        val scanner = adapter.bluetoothLeScanner ?: return "BLE scanning is not available."
        val settings = AppSettings(context)

        val filters = listOf(
            // BPA v1 manufacturer data: company ID + version byte 0x01.
            ScanFilter.Builder().setManufacturerData(settings.companyId, byteArrayOf(0x01), byteArrayOf(0xFF.toByte())).build(),
            // iBeacon layout: 0x02 0x15 prefix under Apple's company ID.
            ScanFilter.Builder().setManufacturerData(BeaconParser.APPLE_COMPANY_ID, byteArrayOf(0x02, 0x15), byteArrayOf(0xFF.toByte(), 0xFF.toByte())).build(),
        )
        val scanSettings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_POWER)
            .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
            .build()

        val result = scanner.startScan(filters, scanSettings, pendingIntent(context, PendingIntent.FLAG_UPDATE_CURRENT))
        return if (result == 0) "Scanning in the background for station beacons." else "Could not start scanning (error $result)."
    }

    @SuppressLint("MissingPermission")
    fun stop(context: Context): String {
        val scanner = context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner ?: return "Scanning stopped."
        scanner.stopScan(pendingIntent(context, PendingIntent.FLAG_UPDATE_CURRENT))
        return "Scanning stopped."
    }
}
