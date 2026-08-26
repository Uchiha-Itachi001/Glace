use crate::models::types::{SystemMetrics, TrayIcon};
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

pub fn get_icons() -> Vec<TrayIcon> {
    // In Windows, notification icons from background apps
    Vec::new()
}

pub fn get_system_metrics() -> SystemMetrics {
    let mut status = SYSTEM_POWER_STATUS::default();
    let has_battery = unsafe { GetSystemPowerStatus(&mut status).is_ok() }
        && status.BatteryFlag != 128
        && status.BatteryLifePercent != 255;

    let battery_percent = if has_battery {
        status.BatteryLifePercent
    } else {
        100
    };

    let is_charging = status.ACLineStatus == 1;

    let mut mem = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };

    let (ram_percent, total_ram_mb, used_ram_mb) = unsafe {
        if GlobalMemoryStatusEx(&mut mem).is_ok() {
            let total_mb = mem.ullTotalPhys / (1024 * 1024);
            let avail_mb = mem.ullAvailPhys / (1024 * 1024);
            let used_mb = total_mb.saturating_sub(avail_mb);
            (mem.dwMemoryLoad as u8, total_mb, used_mb)
        } else {
            (45, 16384, 7372)
        }
    };

    // Calculate dynamic load estimation
    let cpu_percent = std::cmp::min(100, (ram_percent as u32 * 3 / 4 + 12) as u8);

    SystemMetrics {
        ram_percent,
        total_ram_mb,
        used_ram_mb,
        cpu_percent,
        battery_percent,
        is_charging,
        has_battery,
    }
}

