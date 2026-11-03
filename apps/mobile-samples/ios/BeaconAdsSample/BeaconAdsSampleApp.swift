import SwiftUI
import UserNotifications

@main
struct BeaconAdsSampleApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var monitor = BeaconMonitor()

    var body: some Scene {
        WindowGroup {
            ContentView(monitor: monitor)
        }
    }
}

/// Shows notifications while the app is open and handles taps (click reporting + landing page).
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        guard let campaignId = info["campaignId"] as? String, let beaconId = info["beaconId"] as? String else { return }
        let test = info["test"] as? Bool ?? false
        try? await APIClient().report("notification_clicked", campaignId: campaignId, beaconId: beaconId, rssi: nil, test: test)

        // The server only accepts https landing pages (http for localhost); never open other schemes.
        if let string = info["landingUrl"] as? String, let url = URL(string: string), url.scheme == "https" || url.scheme == "http" {
            await MainActor.run { UIApplication.shared.open(url) }
        }
    }
}
