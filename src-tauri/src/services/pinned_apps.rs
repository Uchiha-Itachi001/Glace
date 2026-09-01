use std::fs;
use std::path::PathBuf;
use windows::core::{Interface, PCWSTR};
use windows::Win32::Foundation::SIZE;
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC,
    BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP,
};
use windows::Win32::System::Com::StructuredStorage::CreateStreamOnHGlobal;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER,
    COINIT_APARTMENTTHREADED, IPersistFile, IPersistStream, STGM_READ,
};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::System::Registry::{
    RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ, REG_BINARY,
};
use windows::Win32::UI::Shell::{
    IShellItemImageFactory, IShellLinkW, ShellLink, SHCreateItemFromParsingName,
    SHGetFileInfoW, SHGetNameFromIDList, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON,
    SIGDN_DESKTOPABSOLUTEPARSING, SIGDN_NORMALDISPLAY, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY,
};
use windows::Win32::UI::WindowsAndMessaging::DestroyIcon;

use crate::config::settings;
use crate::models::types::PinnedApp;
use crate::services::window_watcher::hicon_to_base64_png;

/// Converts an HBITMAP (32-bit ARGB/DIB) from Windows Shell into a base64 PNG data URI
pub fn hbitmap_to_base64_png(hbitmap: HBITMAP) -> Option<String> {
    if hbitmap.0.is_null() {
        return None;
    }
    unsafe {
        let mut bm = BITMAP::default();
        let ret = GetObjectW(
            hbitmap.into(),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut _ as *mut _),
        );
        if ret == 0 || bm.bmWidth <= 0 || bm.bmHeight <= 0 {
            return None;
        }

        let width = bm.bmWidth as u32;
        let height = bm.bmHeight as u32;
        let mut rgba_pixels = vec![0u8; (width * height * 4) as usize];

        // 1. Direct DIBSection buffer copy if bmBits is available
        if !bm.bmBits.is_null() && bm.bmBitsPixel == 32 {
            let src_ptr = bm.bmBits as *const u8;
            let pitch = if bm.bmWidthBytes > 0 {
                bm.bmWidthBytes as usize
            } else {
                (width * 4) as usize
            };
            let mut has_non_zero_alpha = false;

            for y in 0..height {
                // In DIBSection bottom-up order, row 0 is bottom line
                let src_y = (height - 1 - y) as usize;
                let src_row = src_ptr.add(src_y * pitch);
                let dst_offset = (y as usize * width as usize * 4) as usize;
                let dst_row = &mut rgba_pixels[dst_offset..dst_offset + (width as usize * 4)];

                for x in 0..width as usize {
                    let b = *src_row.add(x * 4);
                    let g = *src_row.add(x * 4 + 1);
                    let r = *src_row.add(x * 4 + 2);
                    let a = *src_row.add(x * 4 + 3);

                    if a > 0 {
                        has_non_zero_alpha = true;
                    }

                    dst_row[x * 4] = r;
                    dst_row[x * 4 + 1] = g;
                    dst_row[x * 4 + 2] = b;
                    dst_row[x * 4 + 3] = a;
                }
            }

            // If alpha channel was entirely 0 (standard for 24-bit GDI bitmaps), make all non-black pixels opaque
            if !has_non_zero_alpha {
                for px in rgba_pixels.chunks_exact_mut(4) {
                    if px[0] != 0 || px[1] != 0 || px[2] != 0 {
                        px[3] = 255;
                    }
                }
            }
        } else {
            // Fallback to GetDIBits using a valid Screen DC
            let hdc_screen = GetDC(None);
            if hdc_screen.0.is_null() {
                return None;
            }
            let mem_dc = CreateCompatibleDC(Some(hdc_screen));
            let _ = ReleaseDC(None, hdc_screen);
            if mem_dc.0.is_null() {
                return None;
            }

            let mut bmi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: width as i32,
                    biHeight: -(height as i32), // top-down DIB
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    biSizeImage: (width * height * 4) as u32,
                    biXPelsPerMeter: 0,
                    biYPelsPerMeter: 0,
                    biClrUsed: 0,
                    biClrImportant: 0,
                },
                bmiColors: [windows::Win32::Graphics::Gdi::RGBQUAD::default()],
            };

            let lines = GetDIBits(
                mem_dc,
                hbitmap,
                0,
                height,
                Some(rgba_pixels.as_mut_ptr() as *mut _),
                &mut bmi,
                DIB_RGB_COLORS,
            );
            let _ = DeleteDC(mem_dc);

            if lines == 0 {
                return None;
            }

            let mut has_alpha = false;
            for px in rgba_pixels.chunks_exact(4) {
                if px[3] != 0 {
                    has_alpha = true;
                    break;
                }
            }

            for px in rgba_pixels.chunks_exact_mut(4) {
                px.swap(0, 2); // B <-> R
                if !has_alpha && (px[0] != 0 || px[1] != 0 || px[2] != 0) {
                    px[3] = 255;
                }
            }
        }

        let img_buf = image::RgbaImage::from_raw(width, height, rgba_pixels)?;
        let mut png_bytes: Vec<u8> = Vec::new();
        let encoder = image::codecs::png::PngEncoder::new(&mut png_bytes);
        img_buf.write_with_encoder(encoder).ok()?;

        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
        Some(format!("data:image/png;base64,{}", b64))
    }
}

/// Resolves a .lnk shortcut file to its real target path (e.g. C:\...\brave.exe)
pub fn resolve_shortcut_target(lnk_path: &str) -> Option<String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let shell_link: Result<IShellLinkW, _> =
            CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER);
        if let Ok(link) = shell_link {
            if let Ok(persist_file) = link.cast::<IPersistFile>() {
                let lnk_path_w: Vec<u16> =
                    lnk_path.encode_utf16().chain(std::iter::once(0)).collect();
                if persist_file
                    .Load(PCWSTR(lnk_path_w.as_ptr()), STGM_READ)
                    .is_ok()
                {
                    let mut path_buf = [0u16; 1024];
                    let mut find_data =
                        windows::Win32::Storage::FileSystem::WIN32_FIND_DATAW::default();
                    if link.GetPath(&mut path_buf, &mut find_data, 0).is_ok() {
                        let len = path_buf
                            .iter()
                            .position(|&c| c == 0)
                            .unwrap_or(path_buf.len());
                        let target = String::from_utf16_lossy(&path_buf[..len]);
                        if !target.is_empty() && PathBuf::from(&target).exists() {
                            return Some(target);
                        }
                    }
                }
            }
        }
    }
    None
}

/// Extract high-res icon from any shell path, .lnk, .exe, or shell:AppsFolder AUMID
pub fn extract_icon_from_shell_target(target: &str) -> String {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        // 1. Try IShellItemImageFactory on the target path directly (works for AUMIDs and .lnk files)
        let target_w: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
        let factory_res: Result<IShellItemImageFactory, _> =
            SHCreateItemFromParsingName(PCWSTR(target_w.as_ptr()), None);
        if let Ok(factory) = factory_res {
            let size = SIZE {
                cx: 128,
                cy: 128,
            };
            // Try SIIGBF_ICONONLY first to get authentic crisp icon
            let hbitmap_res = factory
                .GetImage(size, SIIGBF_ICONONLY)
                .or_else(|_| factory.GetImage(size, SIIGBF_BIGGERSIZEOK));

            if let Ok(hbitmap) = hbitmap_res {
                if !hbitmap.0.is_null() {
                    let b64 = hbitmap_to_base64_png(hbitmap);
                    let _ = DeleteObject(hbitmap.into());
                    if let Some(png) = b64 {
                        return png;
                    }
                }
            }
        }

        // 2. If it's a .lnk file, try extracting from the resolved target executable
        if target.to_lowercase().ends_with(".lnk") {
            if let Some(resolved) = resolve_shortcut_target(target) {
                if !resolved.is_empty() && !resolved.eq_ignore_ascii_case(target) {
                    let res_w: Vec<u16> = resolved.encode_utf16().chain(std::iter::once(0)).collect();
                    let factory_res: Result<IShellItemImageFactory, _> =
                        SHCreateItemFromParsingName(PCWSTR(res_w.as_ptr()), None);
                    if let Ok(factory) = factory_res {
                        let size = SIZE { cx: 128, cy: 128 };
                        if let Ok(hbitmap) = factory.GetImage(size, SIIGBF_BIGGERSIZEOK) {
                            if !hbitmap.0.is_null() {
                                let b64 = hbitmap_to_base64_png(hbitmap);
                                let _ = DeleteObject(hbitmap.into());
                                if let Some(png) = b64 {
                                    return png;
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Fallback to SHGetFileInfoW
        extract_icon_from_path(target)
    }
}

/// Extract icon from a path using SHGetFileInfoW fallback
pub fn extract_icon_from_path(path: &str) -> String {
    let target_path = if path.to_lowercase().ends_with(".lnk") {
        resolve_shortcut_target(path).unwrap_or_else(|| path.to_string())
    } else {
        path.to_string()
    };

    unsafe {
        let path_w: Vec<u16> = target_path.encode_utf16().chain(std::iter::once(0)).collect();
        let mut shfi = SHFILEINFOW::default();
        let res = SHGetFileInfoW(
            PCWSTR(path_w.as_ptr()),
            Default::default(),
            Some(&mut shfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        );
        if res != 0 && !shfi.hIcon.0.is_null() {
            let b64 = hicon_to_base64_png(shfi.hIcon);
            let _ = DestroyIcon(shfi.hIcon);
            if let Some(b64) = b64 {
                return b64;
            }
        }
    }
    String::new()
}

/// Dynamically extracts the executable file name or AUMID from the target path or title
pub fn extract_exe_name(target_or_path: &str, title: &str) -> String {
    // 1. If it's a .lnk file, resolve the real target executable path
    let resolved = if target_or_path.to_lowercase().ends_with(".lnk") {
        resolve_shortcut_target(target_or_path).unwrap_or_else(|| target_or_path.to_string())
    } else {
        target_or_path.to_string()
    };

    // 2. If it points to an actual file on disk with an executable extension
    if let Some(file_name) = PathBuf::from(&resolved).file_name().and_then(|n| n.to_str()) {
        if file_name.to_lowercase().ends_with(".exe") {
            return file_name.to_string();
        }
    }

    // 3. If it's an AUMID / Packaged App (e.g. "gemini.google.com-112B99EB_vn3jms8s81tkg!App")
    if resolved.contains('!') {
        let clean = resolved.trim_start_matches("shell:AppsFolder\\");
        return clean.to_string();
    }

    // 4. Default dynamic fallback
    format!("{}.exe", title.replace(' ', ""))
}

/// Reads the native Taskband binary stream from HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband
fn read_taskband_binary() -> Option<Vec<u8>> {
    unsafe {
        let subkey: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Taskband\0"
            .encode_utf16()
            .collect();
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
            return None;
        }

        // Try FavoritesResolve first, fallback to Favorites
        for val_name_str in ["FavoritesResolve\0", "Favorites\0"] {
            let val_name: Vec<u16> = val_name_str.encode_utf16().collect();
            let mut data_type = REG_BINARY;
            let mut data_size: u32 = 0;
            if RegQueryValueExW(
                hkey,
                PCWSTR(val_name.as_ptr()),
                None,
                Some(&mut data_type),
                None,
                Some(&mut data_size),
            )
            .is_ok()
                && data_size > 4
            {
                let mut buffer = vec![0u8; data_size as usize];
                if RegQueryValueExW(
                    hkey,
                    PCWSTR(val_name.as_ptr()),
                    None,
                    Some(&mut data_type),
                    Some(buffer.as_mut_ptr()),
                    Some(&mut data_size),
                )
                .is_ok()
                {
                    let _ = RegCloseKey(hkey);
                    return Some(buffer);
                }
            }
        }
        let _ = RegCloseKey(hkey);
    }
    None
}

/// Parses the native Windows Taskband binary stream into ordered PinnedApp objects
pub fn parse_taskband_pins(buffer: &[u8]) -> Vec<PinnedApp> {
    let mut pinned = Vec::new();
    let mut pos = 0;

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        while pos + 4 <= buffer.len() {
            let chunk_len = u32::from_le_bytes(buffer[pos..pos + 4].try_into().unwrap_or([0; 4])) as usize;
            if chunk_len == 0 || pos + 4 + chunk_len > buffer.len() {
                break;
            }

            let chunk_data = &buffer[pos + 4..pos + 4 + chunk_len];

            // Allocate HGLOBAL and copy chunk data into it
            if let Ok(hglobal) = GlobalAlloc(GMEM_MOVEABLE, chunk_len) {
                let p_mem = GlobalLock(hglobal);
                if !p_mem.is_null() {
                    std::ptr::copy_nonoverlapping(chunk_data.as_ptr(), p_mem as *mut u8, chunk_len);
                    let _ = GlobalUnlock(hglobal);

                    if let Ok(stream) = CreateStreamOnHGlobal(hglobal, true) {
                        let link_res: Result<IShellLinkW, _> =
                            CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER);
                        if let Ok(link) = link_res {
                            if let Ok(p_stream) = link.cast::<IPersistStream>() {
                                if p_stream.Load(&stream).is_ok() {
                                    let mut path_buf = [0u16; 1024];
                                    let mut find_data =
                                        windows::Win32::Storage::FileSystem::WIN32_FIND_DATAW::default();
                                    let _ = link.GetPath(&mut path_buf, &mut find_data, 0);
                                    let path_len = path_buf
                                        .iter()
                                        .position(|&c| c == 0)
                                        .unwrap_or(path_buf.len());
                                    let raw_path = String::from_utf16_lossy(&path_buf[..path_len]);

                                    let mut display_name = String::new();
                                    let mut parsing_name = String::new();

                                    if let Ok(pidl) = link.GetIDList() {
                                        if !pidl.is_null() {
                                            if let Ok(disp_ptr) = SHGetNameFromIDList(
                                                pidl,
                                                SIGDN_NORMALDISPLAY,
                                            ) {
                                                if !disp_ptr.0.is_null() {
                                                    display_name = disp_ptr.to_string().unwrap_or_default();
                                                    windows::Win32::System::Com::CoTaskMemFree(Some(
                                                        disp_ptr.0 as *const _,
                                                    ));
                                                }
                                            }

                                            if let Ok(parse_ptr) = SHGetNameFromIDList(
                                                pidl,
                                                SIGDN_DESKTOPABSOLUTEPARSING,
                                            ) {
                                                if !parse_ptr.0.is_null() {
                                                    parsing_name =
                                                        parse_ptr.to_string().unwrap_or_default();
                                                    windows::Win32::System::Com::CoTaskMemFree(Some(
                                                        parse_ptr.0 as *const _,
                                                    ));
                                                }
                                            }

                                            windows::Win32::System::Com::CoTaskMemFree(Some(
                                                pidl as *const _,
                                            ));
                                        }
                                    }

                                    // Determine title, target, launch command and icon
                                    let mut title = display_name;
                                    let is_aumid = parsing_name.contains('!')
                                        || (!parsing_name.contains('\\')
                                            && !parsing_name.ends_with(".lnk")
                                            && !parsing_name.is_empty());

                                    let launch_target = if is_aumid {
                                        if parsing_name.starts_with("shell:AppsFolder\\") {
                                            parsing_name.clone()
                                        } else {
                                            format!("shell:AppsFolder\\{}", parsing_name)
                                        }
                                    } else if !raw_path.is_empty() {
                                        raw_path.clone()
                                    } else if !parsing_name.is_empty() {
                                        parsing_name.clone()
                                    } else {
                                        String::new()
                                    };

                                    if title.is_empty() {
                                        if let Some(stem) = PathBuf::from(&launch_target)
                                            .file_stem()
                                            .map(|s| s.to_string_lossy().to_string())
                                        {
                                            title = stem;
                                        } else {
                                            title = "App".into();
                                        }
                                    }

                                    // Clean any weird prefix characters from display title
                                    title = title.trim_start_matches(|c: char| !c.is_alphanumeric()).to_string();

                                    // Extract icon from the original .lnk path or launch target directly
                                    let icon_b64 = if !raw_path.is_empty() && PathBuf::from(&raw_path).exists() {
                                        let icon = extract_icon_from_shell_target(&raw_path);
                                        if !icon.is_empty() {
                                            icon
                                        } else {
                                            extract_icon_from_shell_target(&launch_target)
                                        }
                                    } else {
                                        extract_icon_from_shell_target(&launch_target)
                                    };

                                    let exe = extract_exe_name(&launch_target, &title);
                                    let id = title
                                        .to_lowercase()
                                        .chars()
                                        .map(|c| if c.is_alphanumeric() { c } else { '-' })
                                        .collect::<String>();

                                    if !title.is_empty() && !launch_target.is_empty() {
                                        pinned.push(PinnedApp {
                                            id,
                                            title,
                                            exe,
                                            lnk_path: launch_target,
                                            icon_b64,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }

            pos += 4 + chunk_len;
        }
    }

    pinned
}

/// Scans the native Windows Taskbar user-pinned shortcuts directory as supplemental source
pub fn scan_windows_taskbar_dir() -> Vec<PinnedApp> {
    let mut pinned = Vec::new();
    let app_data = std::env::var("APPDATA").unwrap_or_default();
    if app_data.is_empty() {
        return pinned;
    }

    let taskbar_dir = PathBuf::from(app_data)
        .join("Microsoft")
        .join("Internet Explorer")
        .join("Quick Launch")
        .join("User Pinned")
        .join("TaskBar");

    if let Ok(entries) = fs::read_dir(&taskbar_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext.to_string_lossy().eq_ignore_ascii_case("lnk") {
                        let file_stem = path
                            .file_stem()
                            .map(|s| s.to_string_lossy().to_string())
                            .unwrap_or_default();

                        if file_stem.eq_ignore_ascii_case("Tombstones") {
                            continue;
                        }

                        let lnk_path = path.to_string_lossy().to_string();
                        let icon_b64 = extract_icon_from_shell_target(&lnk_path);
                        let exe = extract_exe_name(&lnk_path, &file_stem);
                        let id = file_stem
                            .to_lowercase()
                            .chars()
                            .map(|c| if c.is_alphanumeric() { c } else { '-' })
                            .collect::<String>();

                        pinned.push(PinnedApp {
                            id,
                            title: file_stem,
                            exe,
                            lnk_path,
                            icon_b64,
                        });
                    }
                }
            }
        }
    }

    pinned
}

/// Discovers all native Windows Taskbar pinned apps in their exact Windows order
pub fn scan_windows_taskbar_pins() -> Vec<PinnedApp> {
    // Primary: Taskband binary stream from HKCU (authoritative source of truth for pinned apps & exact order)
    let bin = read_taskband_binary();
    let primary_pins = bin.map(|b| parse_taskband_pins(&b)).unwrap_or_default();

    if !primary_pins.is_empty() {
        primary_pins
    } else {
        // Fallback only if Taskband registry key couldn't be parsed
        scan_windows_taskbar_dir()
    }
}

/// Retrieves the current pinned applications
pub fn get_pinned_apps() -> Vec<PinnedApp> {
    let mut cfg = settings::load();

    // Scan native Windows TaskBar pins
    let mut scanned = scan_windows_taskbar_pins();

    // Only fallback to saved icon if freshly scanned icon is empty
    for scanned_app in &mut scanned {
        if scanned_app.icon_b64.is_empty() {
            if let Some(saved) = cfg.pinned_apps.iter().find(|p| p.id == scanned_app.id) {
                if !saved.icon_b64.is_empty() && saved.icon_b64.starts_with("data:image/png") {
                    scanned_app.icon_b64 = saved.icon_b64.clone();
                }
            }
        }
    }

    // Persist the updated list
    cfg.pinned_apps = scanned.clone();
    settings::save(&cfg);

    scanned
}

/// Starts real-time Win32 Taskband registry watcher to detect newly pinned/unpinned apps with zero latency
pub fn start_watcher(app: tauri::AppHandle) {
    use std::thread;
    use std::time::Duration;
    use tauri::Emitter;
    use windows::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
    use windows::Win32::System::Registry::{KEY_NOTIFY, REG_NOTIFY_CHANGE_LAST_SET, RegNotifyChangeKeyValue};
    use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};

    thread::spawn(move || {
        let subkey: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Taskband\0"
            .encode_utf16()
            .collect();

        let mut last_pins = get_pinned_apps();

        loop {
            let mut hkey = HKEY::default();
            let open_res = unsafe {
                RegOpenKeyExW(
                    HKEY_CURRENT_USER,
                    PCWSTR(subkey.as_ptr()),
                    Some(0),
                    KEY_NOTIFY,
                    &mut hkey,
                )
            };

            if open_res.is_err() {
                thread::sleep(Duration::from_millis(1500));
                let current_pins = get_pinned_apps();
                if current_pins != last_pins {
                    let _ = app.emit("pinned-apps-updated", &current_pins);
                    last_pins = current_pins;
                }
                continue;
            }

            let event = unsafe {
                match CreateEventW(None, false, false, PCWSTR::null()) {
                    Ok(e) => e,
                    Err(_) => {
                        let _ = RegCloseKey(hkey);
                        thread::sleep(Duration::from_millis(1500));
                        continue;
                    }
                }
            };

            unsafe {
                let _ = RegNotifyChangeKeyValue(
                    hkey,
                    true,
                    REG_NOTIFY_CHANGE_LAST_SET,
                    Some(event),
                    true,
                );
            }

            // Wait for registry notification with 1500ms timeout fallback
            let wait_res = unsafe { WaitForSingleObject(event, 1500) };

            if wait_res == WAIT_OBJECT_0 || wait_res.0 == 0 {
                // Short debounce to allow Explorer to finish writing binary stream
                thread::sleep(Duration::from_millis(150));
            }

            unsafe {
                let _ = CloseHandle(event);
                let _ = RegCloseKey(hkey);
            }

            let current_pins = get_pinned_apps();
            if current_pins != last_pins {
                let _ = app.emit("pinned-apps-updated", &current_pins);
                last_pins = current_pins;
            }
        }
    });
}

/// Searches user Start Menu directories for installed PWA / Web App shortcuts (Edge Apps, Chrome Apps, Brave Apps)
pub fn find_pwa_shortcut(app_title: &str) -> Option<String> {
    let clean_title = app_title.trim().to_lowercase();
    if clean_title.is_empty() {
        return None;
    }

    let app_data = std::env::var("APPDATA").unwrap_or_default();
    if app_data.is_empty() {
        return None;
    }

    let search_dirs = [
        PathBuf::from(&app_data).join("Microsoft").join("Windows").join("Start Menu").join("Programs").join("Edge Apps"),
        PathBuf::from(&app_data).join("Microsoft").join("Windows").join("Start Menu").join("Programs").join("Chrome Apps"),
        PathBuf::from(&app_data).join("Microsoft").join("Windows").join("Start Menu").join("Programs").join("Brave Apps"),
        PathBuf::from(&app_data).join("Microsoft").join("Windows").join("Start Menu").join("Programs"),
    ];

    let clean_norm = clean_title
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect::<String>();

    for dir in &search_dirs {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(ext) = path.extension() {
                        if ext.to_string_lossy().eq_ignore_ascii_case("lnk") {
                            let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
                            let stem_norm = stem.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect::<String>();
                            if !stem_norm.is_empty() && (stem_norm == clean_norm || stem_norm.contains(&clean_norm) || clean_norm.contains(&stem_norm)) {
                                return Some(path.to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

/// Pins an application to Glace taskbar
pub fn pin_app(mut app: PinnedApp) -> Result<(), String> {
    let mut cfg = settings::load();

    // If it's a PWA or web app and lnk_path is empty, attempt to link the authentic PWA shortcut
    if app.lnk_path.is_empty() {
        if let Some(pwa_lnk) = find_pwa_shortcut(&app.title) {
            app.lnk_path = pwa_lnk;
        }
    }

    if let Some(existing) = cfg.pinned_apps.iter_mut().find(|p| p.id == app.id) {
        *existing = app;
    } else {
        cfg.pinned_apps.push(app);
    }
    settings::save(&cfg);
    Ok(())
}

/// Unpins an application from Glace taskbar
pub fn unpin_app(id_or_exe: &str) -> Result<(), String> {
    let mut cfg = settings::load();
    cfg.pinned_apps.retain(|p| {
        p.id != id_or_exe && !p.exe.eq_ignore_ascii_case(id_or_exe) && !p.title.eq_ignore_ascii_case(id_or_exe)
    });
    settings::save(&cfg);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_taskbar_pins_extraction() {
        let pins = scan_windows_taskbar_pins();
        println!("Found {} pinned apps from device:", pins.len());
        for (i, pin) in pins.iter().enumerate() {
            println!(
                "  [{}] Title: '{}', Id: '{}', Exe: '{}', LnkPath: '{}', HasIcon: {}",
                i,
                pin.title,
                pin.id,
                pin.exe,
                pin.lnk_path,
                !pin.icon_b64.is_empty()
            );
        }
        assert!(!pins.is_empty(), "Should find native pinned apps on device");
    }
}

