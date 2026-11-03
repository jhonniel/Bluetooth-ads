package com.beaconads.sample

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant

data class CampaignNotification(
    val campaignId: String,
    val title: String,
    val message: String,
    val imageUrl: String?,
    val landingUrl: String?,
    val ctaLabel: String?,
    val expiresAt: Instant,
    val eligible: Boolean?,
    val reason: String?,
)

class ApiException(message: String) : Exception(message)

/** Minimal client for the platform's mobile API (see docs/api.md). Call from a background thread. */
class ApiClient(private val settings: AppSettings) {

    fun campaignsForBeacon(beaconId: String, key: Int?, rssi: Int?): List<CampaignNotification> {
        val query = buildString {
            append("device=").append(URLEncoder.encode(settings.deviceToken, "UTF-8"))
            if (key != null) append("&key=").append(key)
            if (rssi != null) append("&rssi=").append(rssi)
        }
        val body = request("GET", "/api/mobile/campaigns/${URLEncoder.encode(beaconId, "UTF-8")}?$query", null)
        val campaigns = JSONObject(body).getJSONObject("data").getJSONArray("campaigns")
        return (0 until campaigns.length()).map { index ->
            val c = campaigns.getJSONObject(index)
            val n = c.getJSONObject("notification")
            val eligibility = c.getJSONObject("eligibility")
            CampaignNotification(
                campaignId = c.getString("id"),
                title = n.getString("title"),
                message = n.getString("message"),
                imageUrl = n.optStringOrNull("imageUrl"),
                landingUrl = n.optStringOrNull("landingUrl"),
                ctaLabel = n.optStringOrNull("ctaLabel"),
                expiresAt = Instant.parse(n.getString("expiresAt")),
                eligible = if (eligibility.isNull("eligible")) null else eligibility.getBoolean("eligible"),
                reason = eligibility.optStringOrNull("reason"),
            )
        }
    }

    /**
     * Reports what actually happened on the device. Only notification_displayed counts as an impression.
     * appVersion "sample-test" marks events produced by the in-app test button.
     */
    fun reportEvent(type: String, campaignId: String, beaconId: String, rssi: Int?, test: Boolean) {
        val event = JSONObject()
            .put("type", type)
            .put("campaignId", campaignId)
            .put("beaconId", beaconId)
            .put("deviceToken", settings.deviceToken)
            .put("occurredAt", Instant.now().toString())
            .put("platform", "android")
            .put("appVersion", if (test) "sample-test" else "sample-1.0")
        if (rssi != null) event.put("rssi", rssi)
        request("POST", "/api/mobile/events", JSONObject().put("events", JSONArray().put(event)).toString())
    }

    private fun request(method: String, path: String, json: String?): String {
        if (settings.serverUrl.isBlank() || settings.apiKey.isBlank()) throw ApiException("Set the server URL and API key first.")
        val connection = URL(settings.serverUrl + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("x-api-key", settings.apiKey)
            if (json != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(json.toByteArray()) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            if (status !in 200..299) {
                val message = runCatching { JSONObject(text).getJSONObject("error").getString("message") }.getOrDefault("HTTP $status")
                throw ApiException(message)
            }
            return text
        } finally {
            connection.disconnect()
        }
    }
}

private fun JSONObject.optStringOrNull(name: String): String? = if (isNull(name)) null else optString(name).ifBlank { null }
