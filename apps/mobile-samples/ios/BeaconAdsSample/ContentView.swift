import CoreLocation
import SwiftUI
import UserNotifications

struct ContentView: View {
    @ObservedObject var monitor: BeaconMonitor
    @State private var serverUrl = AppSettings.shared.serverUrl
    @State private var apiKey = AppSettings.shared.apiKey
    @State private var beaconUUIDs = AppSettings.shared.beaconUUIDs
    @State private var testBeacon = AppSettings.shared.parsedBeaconUUIDs.first?.uuidString.lowercased() ?? ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("Server URL, e.g. http://192.168.1.20:3000", text: $serverUrl)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("Mobile API key", text: $apiKey)
                    TextField("Station beacon UUIDs (comma separated)", text: $beaconUUIDs, axis: .vertical)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("Save settings", action: save)
                }

                Section {
                    Button("1. Allow notifications") {
                        Task {
                            let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
                            monitor.append("Notifications \(granted ? "allowed" : "denied").")
                        }
                    }
                    Button("2. Allow location (choose Always for background)") { monitor.requestPermission() }
                    Button("Start monitoring stations") {
                        save()
                        monitor.startMonitoring(uuids: AppSettings.shared.parsedBeaconUUIDs)
                    }
                    Button("Stop monitoring", role: .destructive) { monitor.stopMonitoring() }
                } header: {
                    Text("Background detection")
                } footer: {
                    Text("Stations must use the iBeacon format. Location access: \(describe(monitor.authorization)).")
                }

                Section("Test without a station") {
                    TextField("Station beacon UUID", text: $testBeacon)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button(busy ? "Fetching…" : "Fetch campaign and notify") {
                        save()
                        busy = true
                        Task {
                            let outcome = await CampaignNotifier.handleDetection(beaconId: testBeacon.trimmingCharacters(in: .whitespaces), campaignKey: nil, rssi: -55, test: true)
                            await MainActor.run {
                                monitor.append(outcome)
                                busy = false
                            }
                        }
                    }
                    .disabled(busy || testBeacon.isEmpty)
                }

                Section("Log") {
                    ForEach(monitor.log, id: \.self) { Text($0).font(.caption.monospaced()) }
                }
            }
            .navigationTitle("Beacon Ads sample")
        }
    }

    private func save() {
        AppSettings.shared.serverUrl = serverUrl
        AppSettings.shared.apiKey = apiKey
        AppSettings.shared.beaconUUIDs = beaconUUIDs
    }

    private func describe(_ status: CLAuthorizationStatus) -> String {
        switch status {
        case .authorizedAlways: return "Always"
        case .authorizedWhenInUse: return "While Using (foreground only)"
        case .denied: return "Denied"
        case .restricted: return "Restricted"
        default: return "Not requested"
        }
    }
}
