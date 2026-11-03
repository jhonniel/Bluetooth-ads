package com.beaconads.sample

/** A platform beacon decoded from manufacturer-specific advertising data. */
data class DetectedBeacon(val beaconId: String, val campaignKey: Int, val measuredPower: Int, val format: String)

/**
 * Kotlin port of packages/shared/src/beacon.ts (decodeBeacon).
 *
 * BPA v1 (manufacturer data after the company ID):
 *   [0] version 0x01, [1..16] beacon UUID, [17..18] campaign key (big-endian), [19] measured power (int8)
 * iBeacon (company 0x004C):
 *   [0] 0x02, [1] 0x15, [2..17] UUID, [18..19] major, [20..21] minor = campaign key, [22] measured power
 */
object BeaconParser {
    const val APPLE_COMPANY_ID = 0x004C
    private const val BPA_VERSION: Byte = 0x01

    fun parse(companyId: Int, data: ByteArray, expectedCompanyId: Int): DetectedBeacon? {
        if (companyId == APPLE_COMPANY_ID) {
            if (data.size != 23 || data[0] != 0x02.toByte() || data[1] != 0x15.toByte()) return null
            return DetectedBeacon(uuid(data, 2), u16(data, 20), data[22].toInt(), "IBEACON")
        }
        if (companyId != expectedCompanyId) return null
        if (data.size != 20 || data[0] != BPA_VERSION) return null
        return DetectedBeacon(uuid(data, 1), u16(data, 17), data[19].toInt(), "MANUFACTURER_DATA")
    }

    private fun u16(data: ByteArray, offset: Int) = ((data[offset].toInt() and 0xFF) shl 8) or (data[offset + 1].toInt() and 0xFF)

    private fun uuid(data: ByteArray, offset: Int): String {
        val hex = (offset until offset + 16).joinToString("") { "%02x".format(data[it]) }
        return "${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}"
    }
}
