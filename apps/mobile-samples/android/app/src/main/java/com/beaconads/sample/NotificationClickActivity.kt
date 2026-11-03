package com.beaconads.sample

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log

/** Invisible activity launched by the notification: reports the click and opens the landing page. */
class NotificationClickActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val campaignId = intent.getStringExtra(EXTRA_CAMPAIGN_ID)
        val beaconId = intent.getStringExtra(EXTRA_BEACON_ID)
        val landingUrl = intent.getStringExtra(EXTRA_LANDING_URL)
        val test = intent.getBooleanExtra(EXTRA_TEST, false)

        if (campaignId != null && beaconId != null) {
            val api = ApiClient(AppSettings(applicationContext))
            Thread {
                runCatching { api.reportEvent("notification_clicked", campaignId, beaconId, null, test) }
                    .onFailure { Log.w("NotificationClick", "Could not report click", it) }
            }.start()
        }

        // The server only accepts https landing pages (http for localhost); never open other schemes.
        if (landingUrl != null && (landingUrl.startsWith("https://") || landingUrl.startsWith("http://"))) {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(landingUrl)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } else {
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        finish()
    }

    companion object {
        const val EXTRA_CAMPAIGN_ID = "campaignId"
        const val EXTRA_BEACON_ID = "beaconId"
        const val EXTRA_LANDING_URL = "landingUrl"
        const val EXTRA_TEST = "test"
    }
}
