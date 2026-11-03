import Foundation
import UserNotifications

/// Detection → fetch live campaigns → pick the first eligible one → local notification → report display.
enum CampaignNotifier {
    static let categoryId = "PROMOTION"

    static func handleDetection(beaconId: String, campaignKey: Int?, rssi: Int?, test: Bool) async -> String {
        let api = APIClient()
        do {
            let campaigns = try await api.campaigns(beaconId: beaconId, key: campaignKey, rssi: rssi)
            guard let first = campaigns.first else { return "No active campaign for this beacon." }

            // Detections are informational; the in-app test does not pretend a beacon was seen.
            if !test { try? await api.report("beacon_detected", campaignId: first.id, beaconId: beaconId, rssi: rssi, test: false) }

            guard let campaign = campaigns.first(where: { $0.eligibility.eligible == true && $0.notification.expiresAt > Date() }) else {
                return "Not notifying: \(first.eligibility.reason ?? "not eligible")."
            }
            guard try await show(campaign, beaconId: beaconId, test: test) else { return "Notifications are not allowed for this app." }
            try? await api.report("notification_displayed", campaignId: campaign.id, beaconId: beaconId, rssi: rssi, test: test)
            return "Notified: \(campaign.notification.title)"
        } catch {
            return "Error: \(error.localizedDescription)"
        }
    }

    private static func show(_ campaign: CampaignsResponse.Campaign, beaconId: String, test: Bool) async throws -> Bool {
        let center = UNUserNotificationCenter.current()
        let status = await center.notificationSettings().authorizationStatus
        guard status == .authorized || status == .provisional || status == .ephemeral else { return false }

        let content = UNMutableNotificationContent()
        content.title = campaign.notification.title
        content.body = campaign.notification.message
        content.sound = .default
        content.categoryIdentifier = categoryId
        content.userInfo = [
            "campaignId": campaign.id,
            "beaconId": beaconId,
            "landingUrl": campaign.notification.landingUrl ?? "",
            "test": test,
        ]
        if let imageUrl = campaign.notification.imageUrl, let attachment = await downloadAttachment(imageUrl) {
            content.attachments = [attachment]
        }

        // Same identifier per campaign replaces an older notification instead of stacking duplicates.
        try await center.add(UNNotificationRequest(identifier: "campaign-\(campaign.id)", content: content, trigger: nil))
        return true
    }

    private static func downloadAttachment(_ urlString: String) async -> UNNotificationAttachment? {
        guard let url = URL(string: urlString), url.scheme == "https" || url.scheme == "http" else { return nil }
        do {
            let (temp, response) = try await URLSession.shared.download(from: url)
            let ext = (response.mimeType == "image/png") ? "png" : (response.mimeType == "image/webp" ? "webp" : "jpg")
            let target = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).\(ext)")
            try FileManager.default.moveItem(at: temp, to: target)
            return try UNNotificationAttachment(identifier: "image", url: target)
        } catch {
            return nil
        }
    }
}
