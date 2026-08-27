use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use crate::models::types::BluetoothDevice;

const CREATE_NO_WINDOW: u32 = 0x08000000;

static BT_DEVICES: OnceLock<Arc<Mutex<Vec<BluetoothDevice>>>> = OnceLock::new();
static IS_ENABLED: AtomicBool = AtomicBool::new(true);

pub fn set_enabled(enabled: bool) {
    IS_ENABLED.store(enabled, Ordering::Relaxed);
    if !enabled {
        if let Some(storage) = BT_DEVICES.get() {
            if let Ok(mut lock) = storage.lock() {
                lock.clear();
            }
        }
    }
}

fn get_storage() -> &'static Arc<Mutex<Vec<BluetoothDevice>>> {
    BT_DEVICES.get_or_init(|| {
        let storage = Arc::new(Mutex::new(Vec::new()));
        let storage_clone = storage.clone();

        // Start background scanner thread (completely decoupled from Tauri IPC thread)
        thread::spawn(move || {
            loop {
                // If disabled in settings, sleep and skip running PowerShell
                if !IS_ENABLED.load(Ordering::Relaxed) {
                    thread::sleep(Duration::from_secs(2));
                    continue;
                }

                let detected = scan_devices();
                if let Ok(mut lock) = storage_clone.lock() {
                    *lock = detected;
                }
                thread::sleep(Duration::from_secs(3));
            }
        });

        storage
    })
}

pub fn start() {
    let _ = get_storage();
}


fn scan_devices() -> Vec<BluetoothDevice> {
    // WinRT & AudioEndpoint scanner to extract ONLY currently connected Bluetooth devices
    let ps_script = r#"
        try {
            Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction SilentlyContinue

            function AwaitTask($WinRtTask) {
                try {
                    $asTask = [System.WindowsRuntimeSystemExtensions]::AsTask($WinRtTask)
                    if ($asTask.Wait(2500)) { $asTask.Result } else { $null }
                } catch { $null }
            }

            $null = [Windows.Devices.Bluetooth.BluetoothDevice, Windows.Devices.Bluetooth, ContentType = WindowsRuntime]
            $null = [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType = WindowsRuntime]

            $result = @()
            $seen = @{}

            # 1. Primary: Query ONLY devices with ConnectionStatus == 1 (Connected)
            try {
                $selector = [Windows.Devices.Bluetooth.BluetoothDevice]::GetDeviceSelectorFromConnectionStatus(1)
                $devInfos = AwaitTask ([Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($selector))

                if ($devInfos) {
                    foreach ($info in $devInfos) {
                        $name = $info.Name
                        if (-not $name) { continue }
                        $name = $name.Trim()
                        if ($name.Length -eq 0 -or $seen.ContainsKey($name)) { continue }
                        if ($name -match '(?i)Adapter|Enumerator|Radio|Generic|Host|Controller|Intel|Realtek|Qualcomm|Microsoft|Device Identification|LE Device|Personal Area|Network Service|RFCOMM') { continue }

                        $batt = $null
                        try {
                            $bt = AwaitTask ([Windows.Devices.Bluetooth.BluetoothDevice]::FromIdAsync($info.Id))
                            if ($bt) {
                                if ($bt.ConnectionStatus -ne 1) { continue }

                                # Query GATT battery
                                $gattResult = AwaitTask ($bt.GetGattServicesForUuidAsync([Guid]'0000180f-0000-1000-8000-00805f9b34fb'))
                                if ($gattResult -and $gattResult.Status -eq 0 -and $gattResult.Services.Count -gt 0) {
                                    $svc = $gattResult.Services[0]
                                    $charResult = AwaitTask ($svc.GetCharacteristicsForUuidAsync([Guid]'00002a19-0000-1000-8000-00805f9b34fb'))
                                    if ($charResult -and $charResult.Status -eq 0 -and $charResult.Characteristics.Count -gt 0) {
                                        $read = AwaitTask ($charResult.Characteristics[0].ReadValueAsync())
                                        if ($read -and $read.Status -eq 0) {
                                            $reader = [Windows.Storage.Streams.DataReader]::FromBuffer($read.Value)
                                            $batt = [int]$reader.ReadByte()
                                        }
                                    }
                                }
                            }
                        } catch {}

                        # Fallback for battery property via PnP
                        if ($null -eq $batt) {
                            try {
                                $pnp = Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -eq $name -and $_.Status -eq 'OK' }
                                foreach ($p in $pnp) {
                                    $prop = Get-PnpDeviceProperty -InstanceId $p.InstanceId -KeyName '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2' -ErrorAction SilentlyContinue
                                    if ($prop -and $prop.Data) {
                                        $batt = [int]$prop.Data
                                        break
                                    }
                                }
                            } catch {}
                        }

                        $seen[$name] = $true
                        $result += [PSCustomObject]@{
                            id = $info.Id
                            name = $name
                            connected = $true
                            battery_percent = $batt
                            device_type = if ($name -match '(?i)Buds|Headset|Headphones|AirPods|Earphones|Speaker|Sound|Audio|Neckband|Wireless') { 'audio' } else { 'generic' }
                        }
                    }
                }
            } catch {}

            # 2. Secondary fallback: Check active connected AudioEndpoint render devices
            if ($result.Count -eq 0) {
                $audioActive = Get-PnpDevice -Class 'AudioEndpoint' -Status 'OK' -ErrorAction SilentlyContinue | Where-Object {
                    $_.FriendlyName -and
                    $_.FriendlyName -notmatch 'Realtek|High Definition Audio|Speakers|Microphone Array|Stereo Mix|NVIDIA|Intel|Display|Steam|Virtual|Default' -and
                    $_.Present -eq $true
                }
                if ($audioActive) {
                    foreach ($adev in $audioActive) {
                        $rawName = $adev.FriendlyName
                        if ($rawName -match '^(?:Headphones|Headset|Earphones|Speakers)\s*\((.*?)\)$') {
                            $rawName = $Matches[1]
                        }
                        $cleanName = (($rawName -replace '\s*Hands-Free AG Audio', '') -replace '\s*Stereo', '').Trim()
                        if ($cleanName.Length -gt 0 -and (-not $seen.ContainsKey($cleanName))) {
                            $batt = $null
                            try {
                                $prop = Get-PnpDeviceProperty -InstanceId $adev.InstanceId -KeyName '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2' -ErrorAction SilentlyContinue
                                if ($prop -and $prop.Data) { $batt = [int]$prop.Data }
                            } catch {}

                            $seen[$cleanName] = $true
                            $result += [PSCustomObject]@{
                                id = $adev.InstanceId
                                name = $cleanName
                                connected = $true
                                battery_percent = $batt
                                device_type = 'audio'
                            }
                        }
                    }
                }
            }

            if ($result.Count -eq 0) {
                Write-Output "[]"
                return
            }

            $result | ConvertTo-Json -Compress
        } catch {
            Write-Output "[]"
        }
    "#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps_script])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    if let Ok(out) = output {
        let stdout_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !stdout_str.is_empty() && stdout_str != "[]" {
            if let Ok(devices) = serde_json::from_str::<Vec<BluetoothDevice>>(&stdout_str) {
                return devices;
            } else if let Ok(single) = serde_json::from_str::<BluetoothDevice>(&stdout_str) {
                return vec![single];
            }
        }
    }

    Vec::new()
}

pub fn get_connected_devices() -> Vec<BluetoothDevice> {
    let storage = get_storage();
    if let Ok(lock) = storage.lock() {
        lock.clone()
    } else {
        Vec::new()
    }
}
