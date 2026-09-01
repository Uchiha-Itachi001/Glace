use crate::models::types::WindowInfo;
use crate::services::window_watcher;

#[tauri::command]
pub fn get_open_windows() -> Vec<WindowInfo> {
    window_watcher::enumerate_windows()
}

#[tauri::command]
pub fn focus_window(hwnd: u64) {
    window_watcher::focus_window(hwnd);
}

#[tauri::command]
pub fn minimize_window(hwnd: u64) {
    window_watcher::minimize_window(hwnd);
}

#[tauri::command]
pub fn close_window(hwnd: u64) {
    window_watcher::close_window(hwnd);
}

#[tauri::command]
pub fn terminate_window_process(hwnd: u64) {
    window_watcher::terminate_window_process(hwnd);
}

#[tauri::command]
pub fn snap_window(hwnd: u64, position: String) {
    window_watcher::snap_window(hwnd, &position);
}

#[tauri::command]
pub fn set_window_height(
    app: tauri::AppHandle,
    expanded: bool,
    height_px: Option<i32>,
) -> Result<(), String> {
    use tauri::Manager;

    if let Some(window) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let size = monitor.size();
            let scale_factor = monitor.scale_factor();
            let bar_height_physical = (48.0 * scale_factor).round() as i32;
            let flyout_h_physical = (height_px.unwrap_or(540) as f64 * scale_factor).round() as i32;
            let flyout_w_physical = (700.0 * scale_factor).round() as i32;

            if let Ok(hwnd) = window.hwnd() {
                let win32_hwnd = windows::Win32::Foundation::HWND(hwnd.0 as *mut core::ffi::c_void);
                crate::services::work_area::update_window_region(
                    win32_hwnd,
                    size.width as i32,
                    size.height as i32,
                    bar_height_physical,
                    expanded,
                    flyout_w_physical,
                    flyout_h_physical,
                );
            }
        }
    }
    Ok(())
}

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

static THUMBNAIL_CACHE: Mutex<Option<HashMap<u64, (Instant, String)>>> = Mutex::new(None);

#[tauri::command]
pub fn get_window_thumbnail(hwnd: u64) -> Option<String> {
    // 1. Fast Cache Lookup (TTL: 1.5 seconds)
    if let Ok(mut guard) = THUMBNAIL_CACHE.lock() {
        let cache = guard.get_or_insert_with(HashMap::new);
        if let Some((ts, base64_str)) = cache.get(&hwnd) {
            if ts.elapsed() < Duration::from_millis(1500) {
                return Some(base64_str.clone());
            }
        }
    }

    unsafe {
        use windows::Win32::Foundation::{HWND, RECT};
        use windows::Win32::Graphics::Gdi::{
            CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
            GetDIBits, ReleaseDC, SelectObject, SetStretchBltMode, StretchBlt, BITMAPINFO,
            BITMAPINFOHEADER, BI_RGB, COLORONCOLOR, DIB_RGB_COLORS, HDC, SRCCOPY,
        };
        use windows::Win32::UI::WindowsAndMessaging::{GetWindowRect, IsWindow};

        extern "system" {
            fn PrintWindow(hwnd: HWND, hdcBlt: HDC, nFlags: u32) -> windows::core::BOOL;
        }

        let target_hwnd = HWND(hwnd as *mut core::ffi::c_void);
        if !IsWindow(Some(target_hwnd)).as_bool() {
            return None;
        }

        let mut rect = RECT::default();
        if GetWindowRect(target_hwnd, &mut rect).is_err() {
            return None;
        }

        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width <= 10 || height <= 10 {
            return None;
        }

        // Thumbnail target size: 240px wide, proportional height
        let thumb_w = 240i32;
        let thumb_h = ((height as f32 / width as f32) * 240.0).round().max(100.0).min(180.0) as i32;

        let hdc_screen = GetDC(Some(target_hwnd));
        if hdc_screen.is_invalid() {
            return None;
        }

        // Capture full window in memory DC
        let hdc_mem = CreateCompatibleDC(Some(hdc_screen));
        let hbm_full = CreateCompatibleBitmap(hdc_screen, width, height);
        let hbm_full_old = SelectObject(hdc_mem, hbm_full.into());

        // PW_RENDERFULLCONTENT (0x2) captures DWM hardware-accelerated/DirectX windows
        let print_ok = PrintWindow(target_hwnd, hdc_mem, 2).as_bool();
        if !print_ok {
            let _ = PrintWindow(target_hwnd, hdc_mem, 0);
        }

        // Create miniature thumbnail DC and downscale via GDI StretchBlt (0.1ms hardware speed)
        let hdc_thumb = CreateCompatibleDC(Some(hdc_screen));
        let hbm_thumb = CreateCompatibleBitmap(hdc_screen, thumb_w, thumb_h);
        let hbm_thumb_old = SelectObject(hdc_thumb, hbm_thumb.into());

        let _ = SetStretchBltMode(hdc_thumb, COLORONCOLOR);
        let _ = StretchBlt(
            hdc_thumb,
            0,
            0,
            thumb_w,
            thumb_h,
            Some(hdc_mem),
            0,
            0,
            width,
            height,
            SRCCOPY,
        );

        // Extract pixels ONLY from the tiny thumbnail bitmap (120 KB vs 8.3 MB)
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: thumb_w,
                biHeight: -thumb_h, // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut raw_pixels: Vec<u8> = vec![0; (thumb_w * thumb_h * 4) as usize];
        let res = GetDIBits(
            hdc_thumb,
            hbm_thumb,
            0,
            thumb_h as u32,
            Some(raw_pixels.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        // Clean up GDI handles immediately
        let _ = SelectObject(hdc_thumb, hbm_thumb_old);
        let _ = DeleteObject(hbm_thumb.into());
        let _ = DeleteDC(hdc_thumb);

        let _ = SelectObject(hdc_mem, hbm_full_old);
        let _ = DeleteObject(hbm_full.into());
        let _ = DeleteDC(hdc_mem);
        let _ = ReleaseDC(Some(target_hwnd), hdc_screen);

        if res == 0 {
            return None;
        }

        // Fast BGRA -> RGBA in-place swap
        for chunk in raw_pixels.chunks_exact_mut(4) {
            let b = chunk[0];
            let r = chunk[2];
            chunk[0] = r;
            chunk[2] = b;
            chunk[3] = 255;
        }

        // Encode tiny thumbnail directly as PNG (takes ~0.5ms)
        let mut png_bytes: Vec<u8> = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut png_bytes);
        if image::write_buffer_with_format(
            &mut cursor,
            &raw_pixels,
            thumb_w as u32,
            thumb_h as u32,
            image::ColorType::Rgba8,
            image::ImageFormat::Png,
        ).is_err() {
            return None;
        }

        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
        let data_url = format!("data:image/png;base64,{b64}");

        // Save to in-memory cache & auto-purge expired items to free memory
        if let Ok(mut guard) = THUMBNAIL_CACHE.lock() {
            let cache = guard.get_or_insert_with(HashMap::new);
            cache.retain(|_, (ts, _)| ts.elapsed() < Duration::from_millis(3000));
            cache.insert(hwnd, (Instant::now(), data_url.clone()));
        }

        Some(data_url)
    }
}