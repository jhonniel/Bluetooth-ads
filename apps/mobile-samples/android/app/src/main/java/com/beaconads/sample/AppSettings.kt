package com.beaconads.sample

import android.content.Context
import java.util.UUID

/** Sample-app settings. The API key is entered on the device; never commit it to source control. */
class AppSettings(context: Context) {
    private val prefs = context.getSharedPreferences("beacon_ads", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = prefs.getString("serverUrl", "") ?: ""
        set(value) = prefs.edit().putString("serverUrl", value.trim().trimEnd('/')).apply()

    var apiKey: String
        get() = prefs.getString("apiKey", "") ?: ""
        set(value) = prefs.edit().putString("apiKey", value.trim()).apply()

    /** Bluetooth SIG company ID used by your stations for manufacturer data (0xFFFF only in development). */
    var companyIdHex: String
        get() = prefs.getString("companyId", "FFFF") ?: "FFFF"
        set(value) = prefs.edit().putString("companyId", value.trim().removePrefix("0x").removePrefix("0X")).apply()

    var testBeaconId: String
        get() = prefs.getString("testBeaconId", "") ?: ""
        set(value) = prefs.edit().putString("testBeaconId", value.trim()).apply()

    val companyId: Int
        get() = companyIdHex.toIntOrNull(16) ?: 0xFFFF

    /**
     * Anonymous per-install token. Random, not derived from hardware, accounts or advertising IDs.
     * The server stores only a keyed hash of it.
     */
    val deviceToken: String
        get() = prefs.getString("deviceToken", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("deviceToken", it).apply()
        }

    /** Avoids calling the API for every advertisement packet; the server still enforces cooldowns. */
    fun shouldHandle(beaconId: String, key: Int?, windowMs: Long = 60_000): Boolean {
        val name = "seen:$beaconId:${key ?: 0}"
        val now = System.currentTimeMillis()
        if (now - prefs.getLong(name, 0) < windowMs) return false
        prefs.edit().putLong(name, now).apply()
        return true
    }
}
