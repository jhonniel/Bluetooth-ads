import Foundation

/// Sample-app settings stored in UserDefaults. The API key is entered on the device; never commit it.
final class AppSettings {
    static let shared = AppSettings()
    private let defaults = UserDefaults.standard

    var serverUrl: String {
        get { defaults.string(forKey: "serverUrl") ?? "" }
        set { defaults.set(newValue.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "/")), forKey: "serverUrl") }
    }

    var apiKey: String {
        get { defaults.string(forKey: "apiKey") ?? "" }
        set { defaults.set(newValue.trimmingCharacters(in: .whitespaces), forKey: "apiKey") }
    }

    /// Proximity UUIDs of stations using the iBeacon format, comma separated. iOS can monitor up to 20 regions.
    var beaconUUIDs: String {
        get { defaults.string(forKey: "beaconUUIDs") ?? "" }
        set { defaults.set(newValue, forKey: "beaconUUIDs") }
    }

    var parsedBeaconUUIDs: [UUID] {
        beaconUUIDs.split(separator: ",").compactMap { UUID(uuidString: $0.trimmingCharacters(in: .whitespaces)) }
    }

    /// Anonymous per-install token. Random; never derived from hardware, accounts or advertising IDs.
    var deviceToken: String {
        if let token = defaults.string(forKey: "deviceToken") { return token }
        let token = UUID().uuidString.lowercased()
        defaults.set(token, forKey: "deviceToken")
        return token
    }

    /// Avoids repeated API calls while ranging; the server still enforces cooldowns and daily limits.
    func shouldHandle(beaconId: String, key: Int, window: TimeInterval = 60) -> Bool {
        let name = "seen:\(beaconId):\(key)"
        let now = Date().timeIntervalSince1970
        if now - defaults.double(forKey: name) < window { return false }
        defaults.set(now, forKey: name)
        return true
    }
}
