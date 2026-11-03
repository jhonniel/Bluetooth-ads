import Foundation

struct CampaignsResponse: Decodable {
    struct Campaign: Decodable {
        struct Notification: Decodable {
            let title: String
            let message: String
            let imageUrl: String?
            let landingUrl: String?
            let ctaLabel: String?
            let expiresAt: Date
        }
        struct Eligibility: Decodable {
            let eligible: Bool?
            let reason: String?
        }
        let id: String
        let beaconKey: Int
        let notification: Notification
        let eligibility: Eligibility
    }
    let campaigns: [Campaign]
}

enum APIError: LocalizedError {
    case notConfigured
    case server(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Set the server URL and API key first."
        case .server(let message): return message
        }
    }
}

/// Minimal client for the platform's mobile API (see docs/api.md).
struct APIClient {
    var settings = AppSettings.shared

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let value = try decoder.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Invalid date \(value)"))
        }
        return decoder
    }()

    func campaigns(beaconId: String, key: Int?, rssi: Int?) async throws -> [CampaignsResponse.Campaign] {
        var query = [URLQueryItem(name: "device", value: settings.deviceToken)]
        if let key { query.append(URLQueryItem(name: "key", value: String(key))) }
        if let rssi { query.append(URLQueryItem(name: "rssi", value: String(rssi))) }
        let data = try await request("GET", path: "/api/mobile/campaigns/\(beaconId.lowercased())", query: query, body: nil)
        struct Envelope: Decodable { let data: CampaignsResponse }
        return try Self.decoder.decode(Envelope.self, from: data).data.campaigns
    }

    /// Reports what actually happened. Only notification_displayed counts as an impression.
    func report(_ type: String, campaignId: String, beaconId: String, rssi: Int?, test: Bool) async throws {
        var event: [String: Any] = [
            "type": type,
            "campaignId": campaignId,
            "beaconId": beaconId.lowercased(),
            "deviceToken": settings.deviceToken,
            "occurredAt": ISO8601DateFormatter().string(from: Date()),
            "platform": "ios",
            "appVersion": test ? "sample-test" : "sample-1.0",
        ]
        if let rssi { event["rssi"] = rssi }
        let body = try JSONSerialization.data(withJSONObject: ["events": [event]])
        _ = try await request("POST", path: "/api/mobile/events", query: [], body: body)
    }

    private func request(_ method: String, path: String, query: [URLQueryItem], body: Data?) async throws -> Data {
        guard !settings.serverUrl.isEmpty, !settings.apiKey.isEmpty, var components = URLComponents(string: settings.serverUrl + path) else {
            throw APIError.notConfigured
        }
        if !query.isEmpty { components.queryItems = query }
        var request = URLRequest(url: components.url!, timeoutInterval: 10)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(settings.apiKey, forHTTPHeaderField: "x-api-key")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            struct ErrorEnvelope: Decodable { struct E: Decodable { let message: String }; let error: E }
            let message = (try? JSONDecoder().decode(ErrorEnvelope.self, from: data).error.message) ?? "HTTP \(status)"
            throw APIError.server(message)
        }
        return data
    }
}
