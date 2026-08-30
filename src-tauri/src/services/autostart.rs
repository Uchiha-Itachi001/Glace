use std::env;
use windows::core::PCWSTR;
use windows::Win32::System::Registry::{
    RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY,
    HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE, KEY_WRITE, REG_SZ,
};

const RUN_KEY_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run\0";
const APP_NAME: &str = "Glace\0";

/// Sets or removes Glace from Windows startup (HKCU\Software\Microsoft\Windows\CurrentVersion\Run)
pub fn set_autostart(enable: bool) -> Result<(), String> {
    unsafe {
        let subkey: Vec<u16> = RUN_KEY_PATH.encode_utf16().collect();
        let app_name: Vec<u16> = APP_NAME.encode_utf16().collect();

        if enable {
            let current_exe = env::current_exe().map_err(|e| format!("Failed to get exe path: {e}"))?;
            let exe_str = format!("\"{}\"", current_exe.to_string_lossy());
            let val_data: Vec<u16> = exe_str.encode_utf16().chain(std::iter::once(0)).collect();
            let val_bytes: &[u8] = std::slice::from_raw_parts(
                val_data.as_ptr() as *const u8,
                val_data.len() * 2,
            );

            let mut hkey = HKEY::default();
            let res = RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey.as_ptr()),
                Some(0),
                KEY_WRITE | KEY_SET_VALUE,
                &mut hkey,
            );

            if res.is_err() {
                return Err(format!("RegOpenKeyExW error: {:?}", res));
            }

            let set_res = RegSetValueExW(
                hkey,
                PCWSTR(app_name.as_ptr()),
                Some(0),
                REG_SZ,
                Some(val_bytes),
            );

            let _ = RegCloseKey(hkey);

            if set_res.is_err() {
                return Err(format!("RegSetValueExW error: {:?}", set_res));
            }
        } else {
            let mut hkey = HKEY::default();
            if RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey.as_ptr()),
                Some(0),
                KEY_SET_VALUE,
                &mut hkey,
            )
            .is_ok()
            {
                let _ = RegDeleteValueW(hkey, PCWSTR(app_name.as_ptr()));
                let _ = RegCloseKey(hkey);
            }
        }
    }
    Ok(())
}

/// Checks whether Glace is currently registered in Windows startup registry
#[allow(dead_code)]
pub fn is_autostart_enabled() -> bool {
    unsafe {
        let subkey: Vec<u16> = RUN_KEY_PATH.encode_utf16().collect();
        let app_name: Vec<u16> = APP_NAME.encode_utf16().collect();
        let mut hkey = HKEY::default();

        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey.as_ptr()),
            Some(0),
            KEY_READ,
            &mut hkey,
        )
        .is_err()
        {
            return false;
        }

        let mut data_type = REG_SZ;
        let mut data_size: u32 = 0;
        let query_res = RegQueryValueExW(
            hkey,
            PCWSTR(app_name.as_ptr()),
            None,
            Some(&mut data_type),
            None,
            Some(&mut data_size),
        );

        let _ = RegCloseKey(hkey);
        query_res.is_ok() && data_size > 0
    }
}

/// Synchronizes autostart status with current settings
pub fn sync_autostart(enable: bool) {
    if let Err(e) = set_autostart(enable) {
        eprintln!("[glace] autostart sync error: {e}");
    }
}
