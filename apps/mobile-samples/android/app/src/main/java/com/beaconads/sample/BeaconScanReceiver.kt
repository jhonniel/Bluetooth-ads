package com.beaconads.sample

import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanResult
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import java.util.concurrent.Executors

/** Receives batched scan results from the OS, decodes platform beacons and hands them to the notifier. */
class BeaconScanReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val error = intent.getIntExtra(BluetoothLeScanner.EXTRA_ERROR_CODE, 0)
        if (error != 0) {
            Log.w(TAG, "Scan failed with error $error")
            return
        }
        val results: List<ScanResult> = if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableArrayListExtra(BluetoothLeScanner.EXTRA_LIST_SCAN_RESULT, ScanResult::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableArrayListExtra(BluetoothLeScanner.EXTRA_LIST_SCAN_RESULT)
        } ?: return

        val settings = AppSettings(context)
        // Strongest signal per beacon/campaign in this batch.
        val detections = results.mapNotNull { result ->
            val data = result.scanRecord?.manufacturerSpecificData ?: return@mapNotNull null
            (0 until data.size()).firstNotNullOfOrNull { i ->
                BeaconParser.parse(data.keyAt(i), data.valueAt(i), settings.companyId)
            }?.let { it to result.rssi }
        }.groupBy { it.first.beaconId to it.first.campaignKey }
            .map { (_, hits) -> hits.maxBy { it.second } }
            .filter { (beacon, _) -> settings.shouldHandle(beacon.beaconId, beacon.campaignKey) }
        if (detections.isEmpty()) return

        val pending = goAsync()
        executor.execute {
            try {
                val notifier = CampaignNotifier(context.applicationContext)
                for ((beacon, rssi) in detections) {
                    val outcome = runCatching { notifier.handleDetection(beacon.beaconId, beacon.campaignKey, rssi, test = false) }
                        .getOrElse { "Error: ${it.message}" }
                    Log.i(TAG, "Beacon ${beacon.beaconId} key ${beacon.campaignKey} rssi $rssi: $outcome")
                }
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        const val ACTION = "com.beaconads.sample.BEACON_SCAN_RESULT"
        private const val TAG = "BeaconScanReceiver"
        private val executor = Executors.newSingleThreadExecutor()
    }
}
