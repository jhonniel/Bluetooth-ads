import CoreLocation
import UIKit

/// Background beacon detection with Core Location.
///
/// iOS does not expose iBeacon or custom manufacturer data through Core Bluetooth, so stations that
/// target iPhones must use the iBeacon format (Dashboard → station → Bluetooth configuration).
/// The station beacon UUID is the proximity UUID; the iBeacon minor carries the campaign key.
/// Entering a region wakes the app for a few seconds, during which it ranges for minor and RSSI.
final class BeaconMonitor: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var log: [String] = []
    @Published private(set) var authorization: CLAuthorizationStatus = .notDetermined

    private let manager = CLLocationManager()
    private var rangingStopTasks: [UUID: DispatchWorkItem] = [:]

    override init() {
        super.init()
        manager.delegate = self
        authorization = manager.authorizationStatus
    }

    func requestPermission() {
        // iOS asks for "While Using" first; "Always" is then offered as an upgrade.
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else {
            manager.requestAlwaysAuthorization()
        }
    }

    func startMonitoring(uuids: [UUID]) {
        guard CLLocationManager.isMonitoringAvailable(for: CLBeaconRegion.self) else {
            return append("Beacon monitoring is not available on this device.")
        }
        for region in manager.monitoredRegions where region is CLBeaconRegion { manager.stopMonitoring(for: region) }
        for uuid in uuids.prefix(20) {
            let region = CLBeaconRegion(uuid: uuid, identifier: uuid.uuidString.lowercased())
            region.notifyEntryStateOnDisplay = true
            region.notifyOnEntry = true
            manager.startMonitoring(for: region)
            manager.requestState(for: region)
        }
        append("Monitoring \(min(uuids.count, 20)) station beacon(s).")
    }

    func stopMonitoring() {
        for region in manager.monitoredRegions { manager.stopMonitoring(for: region) }
        for constraint in manager.rangedBeaconConstraints { manager.stopRangingBeacons(satisfying: constraint) }
        append("Monitoring stopped.")
    }

    // MARK: CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorization = manager.authorizationStatus
    }

    func locationManager(_ manager: CLLocationManager, didDetermineState state: CLRegionState, for region: CLRegion) {
        guard state == .inside, let region = region as? CLBeaconRegion else { return }
        startRanging(region.uuid)
    }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard let region = region as? CLBeaconRegion else { return }
        append("Entered station region \(region.uuid.uuidString.prefix(8))…")
        startRanging(region.uuid)
    }

    func locationManager(_ manager: CLLocationManager, didRange beacons: [CLBeacon], satisfying constraint: CLBeaconIdentityConstraint) {
        // Closest beacon with a usable signal (RSSI 0 means unknown).
        guard let beacon = beacons.filter({ $0.rssi != 0 }).max(by: { $0.rssi < $1.rssi }) else { return }
        let beaconId = beacon.uuid.uuidString.lowercased()
        let key = beacon.minor.intValue
        guard AppSettings.shared.shouldHandle(beaconId: beaconId, key: key) else { return }
        stopRanging(beacon.uuid)

        // Keep the app alive long enough to call the API when woken in the background.
        let task = UIApplication.shared.beginBackgroundTask(withName: "beacon-detection")
        Task {
            let outcome = await CampaignNotifier.handleDetection(beaconId: beaconId, campaignKey: key, rssi: beacon.rssi, test: false)
            await MainActor.run { self.append("Beacon key \(key) RSSI \(beacon.rssi): \(outcome)") }
            UIApplication.shared.endBackgroundTask(task)
        }
    }

    func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        append("Monitoring failed: \(error.localizedDescription)")
    }

    // MARK: Ranging window

    private func startRanging(_ uuid: UUID) {
        manager.startRangingBeacons(satisfying: CLBeaconIdentityConstraint(uuid: uuid))
        rangingStopTasks[uuid]?.cancel()
        let stop = DispatchWorkItem { [weak self] in self?.stopRanging(uuid) }
        rangingStopTasks[uuid] = stop
        DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: stop)
    }

    private func stopRanging(_ uuid: UUID) {
        manager.stopRangingBeacons(satisfying: CLBeaconIdentityConstraint(uuid: uuid))
        rangingStopTasks.removeValue(forKey: uuid)?.cancel()
    }

    func append(_ message: String) {
        let time = Date().formatted(date: .omitted, time: .standard)
        log.insert("[\(time)] \(message)", at: 0)
    }
}
