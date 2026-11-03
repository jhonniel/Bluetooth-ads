package com.beaconads.sample

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.net.URL
import java.time.Instant

/**
 * Turns a beacon detection into a promotional notification:
 * fetch live campaigns for the beacon → pick the first eligible one → show it → report the display.
 */
class CampaignNotifier(private val context: Context) {
    private val settings = AppSettings(context)
    private val api = ApiClient(settings)

    /** Returns a short human-readable outcome for the UI/log. Must run off the main thread. */
    fun handleDetection(beaconId: String, campaignKey: Int?, rssi: Int?, test: Boolean): String {
        val campaigns = api.campaignsForBeacon(beaconId, campaignKey, rssi)
        if (campaigns.isEmpty()) return "No active campaign for beacon $beaconId."

        // Detections are informational only; the in-app test does not pretend a beacon was seen.
        if (!test) runCatching { api.reportEvent("beacon_detected", campaigns.first().campaignId, beaconId, rssi, test = false) }

        val campaign = campaigns.firstOrNull { it.eligible == true && it.expiresAt.isAfter(Instant.now()) }
            ?: return "Not notifying: ${campaigns.first().reason ?: "not eligible"}."

        if (!show(campaign, beaconId, test)) return "Notifications are disabled for this app."
        runCatching { api.reportEvent("notification_displayed", campaign.campaignId, beaconId, rssi, test) }
            .onFailure { Log.w(TAG, "Could not report impression", it) }
        return "Notified: ${campaign.title}"
    }

    private fun show(campaign: CampaignNotification, beaconId: String, test: Boolean): Boolean {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            android.os.Build.VERSION.SDK_INT >= 33
        ) return false
        ensureChannel()

        val tapIntent = Intent(context, NotificationClickActivity::class.java)
            .putExtra(NotificationClickActivity.EXTRA_CAMPAIGN_ID, campaign.campaignId)
            .putExtra(NotificationClickActivity.EXTRA_BEACON_ID, beaconId)
            .putExtra(NotificationClickActivity.EXTRA_LANDING_URL, campaign.landingUrl)
            .putExtra(NotificationClickActivity.EXTRA_TEST, test)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val pendingIntent = PendingIntent.getActivity(
            context,
            campaign.campaignId.hashCode(),
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentTitle(campaign.title)
            .setContentText(campaign.message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(campaign.message))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setTimeoutAfter((campaign.expiresAt.toEpochMilli() - System.currentTimeMillis()).coerceAtLeast(60_000))
        if (campaign.ctaLabel != null) builder.addAction(0, campaign.ctaLabel, pendingIntent)
        campaign.imageUrl?.let { url ->
            loadBitmap(url)?.let { builder.setLargeIcon(it).setStyle(NotificationCompat.BigPictureStyle().bigPicture(it).setSummaryText(campaign.message)) }
        }

        NotificationManagerCompat.from(context).notify(campaign.campaignId.hashCode(), builder.build())
        return true
    }

    private fun loadBitmap(url: String): Bitmap? = runCatching {
        URL(url).openStream().use { BitmapFactory.decodeStream(it) }
    }.getOrNull()

    private fun ensureChannel() {
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Nearby promotions", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "Offers from stores you are close to"
                },
            )
        }
    }

    companion object {
        private const val TAG = "CampaignNotifier"
        const val CHANNEL_ID = "nearby_promotions"
    }
}
