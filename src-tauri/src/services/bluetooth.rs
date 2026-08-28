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
    let ps_script = r#"
        try {
            $result = @()
            $seen = @{}

            # 1. Query ONLY actively connected Bluetooth Audio endpoints (render / communication)
            $audioActive = Get-PnpDevice -Class 'AudioEndpoint' -Status 'OK' -ErrorAction SilentlyContinue | Where-Object {
                $_.Present -eq $true -and
                $_.FriendlyName -notmatch 'Realtek|High Definition Audio|Speakers \(|Microphone Array|Stereo Mix|NVIDIA|Intel|Display|Steam|Virtual|Default'
            }

            if ($audioActive) {
                foreach ($adev in $audioActive) {
                    $rawName = $adev.FriendlyName
                    if ($rawName -match '^(?:Headphones|Headset|Earphones|Speakers|Microphone)\s*\((.*?)\)$') {
                        $rawName = $Matches[1]
                    }
                    $cleanName = (($rawName -replace '\s*Hands-Free AG Audio', '') -replace '\s*Hands-Free', '') -replace '\s*Stereo', ''
                    $cleanName = $cleanName.Trim()

                    if ($cleanName.Length -eq 0 -or $seen.ContainsKey($cleanName.ToLower())) { continue }
                    $seen[$cleanName.ToLower()] = $true

                    # Fetch live battery property for this active device from Hands-Free service
                    $batt = $null
                    $hfDevs = Get-PnpDevice -FriendlyName "*$cleanName*" -Status 'OK' -ErrorAction SilentlyContinue | Where-Object {
                        $_.Present -eq $true -and ($_.FriendlyName -match 'Hands-Free' -or $_.InstanceId -match '{0000111E')
                    }
                    foreach ($h in $hfDevs) {
                        $prop = Get-PnpDeviceProperty -InstanceId $h.InstanceId -KeyName '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2' -ErrorAction SilentlyContinue
                        if ($prop -and $prop.Data -ne $null) {
                            $batt = [int]$prop.Data
                            break
                        }
                    }

                    $result += [PSCustomObject]@{
                        id = $adev.InstanceId
                        name = $cleanName
                        connected = $true
                        battery_percent = $batt
                        device_type = 'audio'
                    }
                }
            }

            # 2. Query ONLY actively connected Bluetooth HID Peripherals (Mice, Keyboards, Gamepads)
            $hidActive = Get-PnpDevice -Class 'HIDClass' -Status 'OK' -ErrorAction SilentlyContinue | Where-Object {
                $_.Present -eq $true -and ($_.InstanceId -match '^BTH\\|^BTHENUM\\|^BTHLE\\|^HID\\{00001124')
            }

            if ($hidActive) {
                foreach ($hdev in $hidActive) {
                    $name = $hdev.FriendlyName.Trim()
                    if ($name.Length -eq 0 -or $seen.ContainsKey($name.ToLower())) { continue }
                    if ($name -match '(?i)Radio|Adapter|Generic|Consumer Control|Vendor Defined|System Multi-Axis') { continue }
                    $seen[$name.ToLower()] = $true

                    $batt = $null
                    $prop = Get-PnpDeviceProperty -InstanceId $hdev.InstanceId -KeyName '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2' -ErrorAction SilentlyContinue
                    if ($prop -and $prop.Data -ne $null) { $batt = [int]$prop.Data }

                    $result += [PSCustomObject]@{
                        id = $hdev.InstanceId
                        name = $name
                        connected = $true
                        battery_percent = $batt
                        device_type = 'generic'
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
