using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Windows.Devices.Bluetooth;
using Windows.Devices.Bluetooth.Advertisement;
using Windows.Devices.Radios;
using Windows.Storage.Streams;

namespace BpaBleHelper;

/// <summary>
/// Native BLE advertiser for the Beacon Ads Windows agent.
///
/// Protocol: one JSON object per line on stdin (requests) and stdout (responses and events).
///   request:  {"id":"1","cmd":"capabilities" | "start" | "stop" | "status" | "protect" | "unprotect", ...}
///   response: {"id":"1","ok":true,"result":...} or {"id":"1","ok":false,"error":"..."}
///   event:    {"event":"publisherStatus","status":"Started","error":"Success","selectedTxPowerDbm":null}
///
/// When stdin closes (the agent exited or was killed) the publisher is stopped and the process exits,
/// so advertising never continues without a supervising agent.
/// </summary>
internal static class Program
{
    private const int LegacyAdvertisingMaxBytes = 31;
    private const int WindowsFlagsOverheadBytes = 3;
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("BpaAgent.StationCredential.v1");
    private static readonly object OutputLock = new();
    private static BluetoothLEAdvertisementPublisher? _publisher;

    public static async Task<int> Main(string[] args)
    {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);

        if (args.Length > 0 && args[0] == "--version")
        {
            Console.WriteLine(typeof(Program).Assembly.GetName().Version?.ToString() ?? "unknown");
            return 0;
        }

        string? line;
        while ((line = await Console.In.ReadLineAsync()) is not null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            await HandleLineAsync(line);
        }

        StopPublisher();
        return 0;
    }

    private static async Task HandleLineAsync(string line)
    {
        string? id = null;
        try
        {
            var request = JsonNode.Parse(line)?.AsObject() ?? throw new InvalidOperationException("Request must be a JSON object.");
            id = request["id"]?.GetValue<string>();
            var cmd = request["cmd"]?.GetValue<string>() ?? throw new InvalidOperationException("Missing cmd.");

            JsonNode? result = cmd switch
            {
                "capabilities" => await GetCapabilitiesAsync(),
                "start" => Start(request),
                "stop" => StopAndReport(),
                "status" => new JsonObject { ["status"] = _publisher?.Status.ToString() ?? "None" },
                "protect" => JsonValue.Create(Protect(request["data"]?.GetValue<string>())),
                "unprotect" => JsonValue.Create(Unprotect(request["data"]?.GetValue<string>())),
                _ => throw new InvalidOperationException($"Unknown command '{cmd}'."),
            };
            Write(new JsonObject { ["id"] = id, ["ok"] = true, ["result"] = result });
        }
        catch (Exception ex)
        {
            Write(new JsonObject { ["id"] = id, ["ok"] = false, ["error"] = $"{ex.GetType().Name}: {ex.Message}" });
        }
    }

    private static async Task<JsonNode> GetCapabilitiesAsync()
    {
        var adapter = await BluetoothAdapter.GetDefaultAsync();
        if (adapter is null)
        {
            return new JsonObject
            {
                ["adapterPresent"] = false,
                ["lowEnergySupported"] = false,
                ["peripheralRoleSupported"] = false,
                ["extendedAdvertisingSupported"] = false,
                ["radioState"] = "unavailable",
                ["adapterName"] = null,
            };
        }

        Radio? radio = null;
        try
        {
            radio = await adapter.GetRadioAsync();
        }
        catch (Exception)
        {
            // Radio access can be denied by privacy settings; report as unknown rather than failing.
        }

        var radioState = radio?.State switch
        {
            RadioState.On => "on",
            RadioState.Off => "off",
            RadioState.Disabled => "disabled",
            null => "unavailable",
            _ => "unknown",
        };

        return new JsonObject
        {
            ["adapterPresent"] = true,
            ["lowEnergySupported"] = adapter.IsLowEnergySupported,
            ["peripheralRoleSupported"] = adapter.IsPeripheralRoleSupported,
            ["extendedAdvertisingSupported"] = adapter.IsExtendedAdvertisingSupported,
            ["radioState"] = radioState,
            ["adapterName"] = radio?.Name,
        };
    }

    private static JsonNode Start(JsonObject request)
    {
        var companyId = request["companyId"]?.GetValue<int>() ?? throw new InvalidOperationException("Missing companyId.");
        if (companyId is < 0 or > 0xFFFF) throw new InvalidOperationException("companyId must be 0..65535.");
        var dataHex = request["dataHex"]?.GetValue<string>() ?? throw new InvalidOperationException("Missing dataHex.");
        var data = Convert.FromHexString(dataHex);

        // Flags (3) + manufacturer AD structure: length (1) + type (1) + company ID (2) + data.
        var total = WindowsFlagsOverheadBytes + 4 + data.Length;
        if (total > LegacyAdvertisingMaxBytes)
        {
            throw new InvalidOperationException($"Advertisement would be {total} bytes; the legacy BLE limit is {LegacyAdvertisingMaxBytes}.");
        }

        StopPublisher();

        var writer = new DataWriter();
        writer.WriteBytes(data);
        var publisher = new BluetoothLEAdvertisementPublisher();
        publisher.Advertisement.ManufacturerData.Add(new BluetoothLEManufacturerData((ushort)companyId, writer.DetachBuffer()));

        var txPower = request["txPowerDbm"];
        if (txPower is not null)
        {
            publisher.PreferredTransmitPowerLevelInDBm = (short)txPower.GetValue<int>();
        }

        publisher.StatusChanged += OnStatusChanged;
        _publisher = publisher;
        publisher.Start();

        return new JsonObject { ["status"] = publisher.Status.ToString() };
    }

    private static JsonNode StopAndReport()
    {
        StopPublisher();
        return new JsonObject { ["status"] = "Stopped" };
    }

    private static void StopPublisher()
    {
        var publisher = _publisher;
        _publisher = null;
        if (publisher is null) return;
        publisher.StatusChanged -= OnStatusChanged;
        try
        {
            if (publisher.Status is BluetoothLEAdvertisementPublisherStatus.Started or BluetoothLEAdvertisementPublisherStatus.Waiting)
            {
                publisher.Stop();
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Stop failed: {ex.Message}");
        }
    }

    private static void OnStatusChanged(BluetoothLEAdvertisementPublisher sender, BluetoothLEAdvertisementPublisherStatusChangedEventArgs args)
    {
        Write(new JsonObject
        {
            ["event"] = "publisherStatus",
            ["status"] = args.Status.ToString(),
            ["error"] = args.Error.ToString(),
            ["selectedTxPowerDbm"] = args.SelectedTransmitPowerLevelInDBm is short selected ? JsonValue.Create(selected) : null,
        });
    }

    /// <summary>DPAPI, machine scope plus application entropy. The installer restricts file ACLs.</summary>
    private static string Protect(string? base64)
    {
        if (string.IsNullOrEmpty(base64)) throw new InvalidOperationException("Missing data.");
        var plain = Convert.FromBase64String(base64);
        try
        {
            return Convert.ToBase64String(ProtectedData.Protect(plain, Entropy, DataProtectionScope.LocalMachine));
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plain);
        }
    }

    private static string Unprotect(string? base64)
    {
        if (string.IsNullOrEmpty(base64)) throw new InvalidOperationException("Missing data.");
        var plain = ProtectedData.Unprotect(Convert.FromBase64String(base64), Entropy, DataProtectionScope.LocalMachine);
        try
        {
            return Convert.ToBase64String(plain);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plain);
        }
    }

    private static void Write(JsonObject message)
    {
        var json = message.ToJsonString(new JsonSerializerOptions { WriteIndented = false });
        lock (OutputLock)
        {
            Console.Out.WriteLine(json);
            Console.Out.Flush();
        }
    }
}
