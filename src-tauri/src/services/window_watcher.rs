use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use windows::core::{BOOL, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, GetMonitorInfoW,
    MonitorFromWindow, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    DIB_RGB_COLORS, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::System::ProcessStatus::K32GetModuleFileNameExW;
use windows::Win32::System::Threading::{
    GetCurrentProcessId, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::Shell::{
    ExtractIconExW, SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON, SHGFI_SMALLICON,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DestroyIcon, DrawIconEx, EnumChildWindows, EnumWindows, GetClassLongPtrW, GetClassNameW,
    GetForegroundWindow, GetWindow, GetWindowLongW, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible, PostMessageW,
    SendMessageTimeoutW, SetForegroundWindow, SetWindowPos, ShowWindow, DI_NORMAL,
    EVENT_OBJECT_CLOAKED, EVENT_OBJECT_CREATE, EVENT_OBJECT_DESTROY, EVENT_OBJECT_NAMECHANGE,
    EVENT_OBJECT_UNCLOAKED, EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_MINIMIZEEND,
    EVENT_SYSTEM_MINIMIZESTART, GCLP_HICON, GCLP_HICONSM, GWL_EXSTYLE, GWL_STYLE, GW_OWNER, HICON,
    MSG, SMTO_ABORTIFHUNG, SWP_FRAMECHANGED, SWP_NOZORDER, SWP_SHOWWINDOW, SW_MAXIMIZE,
    SW_MINIMIZE, SW_RESTORE, SW_SHOW, WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS, WM_CLOSE,
    WM_GETICON, WS_CHILD, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};

use crate::models::types::WindowInfo;

static EVENT_SENDER: Mutex<Option<Sender<()>>> = Mutex::new(None);

pub fn is_taskbar_window(hwnd: HWND, current_pid: u32) -> bool {
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() || !IsWindowVisible(hwnd).as_bool() {
            return false;
        }

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == current_pid || pid == 0 {
            return false;
        }

        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        let is_tool_window = (ex_style & WS_EX_TOOLWINDOW.0) != 0;
        let is_app_window = (ex_style & WS_EX_APPWINDOW.0) != 0;

        if is_tool_window && !is_app_window {
            return false;
        }

        if let Ok(owner) = GetWindow(hwnd, GW_OWNER) {
            if !owner.0.is_null() && !is_app_window {
                return false;
            }
        }

        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        if (style & WS_CHILD.0) != 0 {
            return false;
        }

        let mut cloaked: u32 = 0;
        let _ = DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut _ as *mut std::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        );
        if cloaked != 0 {
            return false;
        }

        let length = GetWindowTextLengthW(hwnd);
        if length == 0 {
            return false;
        }

        let mut class_buf = [0u16; 256];
        let class_len = GetClassNameW(hwnd, &mut class_buf);
        if class_len > 0 {
            let class_name = String::from_utf16_lossy(&class_buf[..class_len as usize]);
            if class_name == "Progman"
                || class_name == "WorkerW"
                || class_name == "Shell_TrayWnd"
                || class_name == "Shell_SecondaryTrayWnd"
                || class_name == "Windows.UI.Core.CoreWindow"
            {
                return false;
            }
        }

        true
    }
}

pub(crate) fn hicon_to_base64_png(hicon: HICON) -> Option<String> {
    if hicon.0.is_null() {
        return None;
    }
    unsafe {
        let hdc_screen = GetDC(None);
        if hdc_screen.0.is_null() {
            return None;
        }
        let mem_dc = CreateCompatibleDC(Some(hdc_screen));
        let _ = ReleaseDC(None, hdc_screen);

        if mem_dc.0.is_null() {
            return None;
        }

        let width = 48i32;
        let height = 48i32;

        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // top-down
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

        let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
        let hbitmap_res = CreateDIBSection(
            Some(mem_dc),
            &bmi,
            DIB_RGB_COLORS,
            &mut bits,
            None,
            0,
        );

        let result = if let Ok(hbitmap) = hbitmap_res {
            if !hbitmap.0.is_null() && !bits.is_null() {
                let old_bm = SelectObject(mem_dc, hbitmap.into());

                // Clear to transparent black
                std::ptr::write_bytes(bits as *mut u8, 0u8, (width * height * 4) as usize);

                let _ = DrawIconEx(
                    mem_dc,
                    0,
                    0,
                    hicon,
                    width,
                    height,
                    0,
                    None,
                    DI_NORMAL,
                );

                // GDI DIB stores pixels as BGRA — convert to RGBA for PNG
                let pixel_slice =
                    std::slice::from_raw_parts_mut(bits as *mut u8, (width * height * 4) as usize);

                // Swap B and R channels: [B, G, R, A] -> [R, G, B, A]
                for px in pixel_slice.chunks_exact_mut(4) {
                    px.swap(0, 2); // B <-> R
                }

                // Encode as PNG using image crate
                let img_buf = image::RgbaImage::from_raw(
                    width as u32,
                    height as u32,
                    pixel_slice.to_vec(),
                );

                let png_result = img_buf.and_then(|img| {
                    let mut png_bytes: Vec<u8> = Vec::new();
                    let encoder = image::codecs::png::PngEncoder::new(&mut png_bytes);
                    img.write_with_encoder(encoder).ok()?;
                    Some(png_bytes)
                });

                let _ = SelectObject(mem_dc, old_bm);
                let _ = DeleteObject(hbitmap.into());

                if let Some(png_bytes) = png_result {
                    use base64::Engine;
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
                    Some(format!("data:image/png;base64,{}", b64))
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        let _ = DeleteDC(mem_dc);
        result
    }
}

// Keep old name as alias for compatibility
pub(crate) fn hicon_to_base64_bmp(hicon: HICON) -> Option<String> {
    hicon_to_base64_png(hicon)
}


fn get_window_icon(hwnd: HWND, exe_path: &str) -> String {
    unsafe {
        // 1. WM_GETICON messages
        for icon_type in [2usize, 0, 1] {
            let mut result: usize = 0;
            let res = SendMessageTimeoutW(
                hwnd,
                WM_GETICON,
                WPARAM(icon_type),
                LPARAM(0),
                SMTO_ABORTIFHUNG,
                30,
                Some(&mut result),
            );
            if res.0 != 0 && result != 0 {
                let hicon = HICON(result as *mut _);
                if let Some(b64) = hicon_to_base64_bmp(hicon) {
                    return b64;
                }
            }
        }

        // 2. Class icons (GCLP_HICONSM & GCLP_HICON)
        let icon_sm = GetClassLongPtrW(hwnd, GCLP_HICONSM);
        if icon_sm != 0 {
            let hicon = HICON(icon_sm as *mut _);
            if let Some(b64) = hicon_to_base64_bmp(hicon) {
                return b64;
            }
        }

        let icon_lg = GetClassLongPtrW(hwnd, GCLP_HICON);
        if icon_lg != 0 {
            let hicon = HICON(icon_lg as *mut _);
            if let Some(b64) = hicon_to_base64_bmp(hicon) {
                return b64;
            }
        }

        // 3. Extract from executable file path
        if !exe_path.is_empty() {
            let exe_w: Vec<u16> = exe_path.encode_utf16().chain(std::iter::once(0)).collect();
            let mut large_icon = HICON::default();
            let mut small_icon = HICON::default();
            let count = ExtractIconExW(
                PCWSTR(exe_w.as_ptr()),
                0,
                Some(&mut large_icon),
                Some(&mut small_icon),
                1,
            );
            if count > 0 {
                let icon_to_use = if !small_icon.0.is_null() {
                    small_icon
                } else {
                    large_icon
                };
                let b64 = hicon_to_base64_bmp(icon_to_use);
                if !small_icon.0.is_null() {
                    let _ = DestroyIcon(small_icon);
                }
                if !large_icon.0.is_null() {
                    let _ = DestroyIcon(large_icon);
                }
                if let Some(b64) = b64 {
                    return b64;
                }
            }

            // 4. SHGetFileInfoW (Official Windows Default Taskbar Shell Icon API)
            let mut shfi = SHFILEINFOW::default();
            let res = SHGetFileInfoW(
                PCWSTR(exe_w.as_ptr()),
                Default::default(),
                Some(&mut shfi),
                std::mem::size_of::<SHFILEINFOW>() as u32,
                SHGFI_ICON | SHGFI_LARGEICON,
            );
            if res != 0 && !shfi.hIcon.0.is_null() {
                let b64 = hicon_to_base64_bmp(shfi.hIcon);
                let _ = DestroyIcon(shfi.hIcon);
                if let Some(b64) = b64 {
                    return b64;
                }
            }

            let res_sm = SHGetFileInfoW(
                PCWSTR(exe_w.as_ptr()),
                Default::default(),
                Some(&mut shfi),
                std::mem::size_of::<SHFILEINFOW>() as u32,
                SHGFI_ICON | SHGFI_SMALLICON,
            );
            if res_sm != 0 && !shfi.hIcon.0.is_null() {
                let b64 = hicon_to_base64_bmp(shfi.hIcon);
                let _ = DestroyIcon(shfi.hIcon);
                if let Some(b64) = b64 {
                    return b64;
                }
            }
        }
    }
    String::new()
}

fn get_window_exe_path(hwnd: HWND) -> (String, String) {
    unsafe {
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return (String::new(), String::new());
        }

        let mut real_pid = pid;

        // Check if top-level process is ApplicationFrameHost (UWP host)
        if let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            if !process.0.is_null() {
                let mut path_buf = [0u16; 1024];
                let len = K32GetModuleFileNameExW(Some(process), None, &mut path_buf);
                let _ = windows::Win32::Foundation::CloseHandle(process);
                if len > 0 {
                    let full_path = String::from_utf16_lossy(&path_buf[..len as usize]);
                    let exe_name = std::path::Path::new(&full_path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();

                    if exe_name.eq_ignore_ascii_case("ApplicationFrameHost.exe") {
                        // Enumerate child windows to find the real UWP core window
                        unsafe extern "system" fn enum_child_proc(
                            child_hwnd: HWND,
                            lparam: LPARAM,
                        ) -> BOOL {
                            let target_pid = &mut *(lparam.0 as *mut u32);
                            let mut child_pid = 0u32;
                            GetWindowThreadProcessId(child_hwnd, Some(&mut child_pid));
                            if child_pid != 0 {
                                if let Ok(proc) =
                                    OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, child_pid)
                                {
                                    if !proc.0.is_null() {
                                        let mut buf = [0u16; 512];
                                        let l = K32GetModuleFileNameExW(Some(proc), None, &mut buf);
                                        let _ = windows::Win32::Foundation::CloseHandle(proc);
                                        if l > 0 {
                                            let name = String::from_utf16_lossy(&buf[..l as usize]);
                                            if !name.ends_with("ApplicationFrameHost.exe") {
                                                *target_pid = child_pid;
                                                return BOOL(0);
                                            }
                                        }
                                    }
                                }
                            }
                            BOOL(1)
                        }

                        let mut uwp_pid = 0u32;
                        let _ = EnumChildWindows(
                            Some(hwnd),
                            Some(enum_child_proc),
                            LPARAM(&mut uwp_pid as *mut _ as isize),
                        );
                        if uwp_pid != 0 {
                            real_pid = uwp_pid;
                        }
                    }
                }
            }
        }

        if let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, real_pid) {
            if !process.0.is_null() {
                let mut path_buf = [0u16; 1024];
                let len = K32GetModuleFileNameExW(Some(process), None, &mut path_buf);
                let _ = windows::Win32::Foundation::CloseHandle(process);
                if len > 0 {
                    let full_path = String::from_utf16_lossy(&path_buf[..len as usize]);
                    let exe_name = std::path::Path::new(&full_path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();
                    return (exe_name, full_path);
                }
            }
        }
    }
    (String::new(), String::new())
}

pub fn get_window_info(hwnd: HWND, fg_hwnd: HWND, current_pid: u32) -> Option<WindowInfo> {
    if !is_taskbar_window(hwnd, current_pid) {
        return None;
    }

    unsafe {
        let mut title_buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut title_buf);
        let title = if len > 0 {
            String::from_utf16_lossy(&title_buf[..len as usize])
        } else {
            String::new()
        };

        let (exe_name, exe_path) = get_window_exe_path(hwnd);
        let icon_b64 = get_window_icon(hwnd, &exe_path);
        let is_focused = hwnd == fg_hwnd;
        let is_minimized = IsIconic(hwnd).as_bool();

        Some(WindowInfo {
            hwnd: hwnd.0 as u64,
            title,
            exe: exe_name,
            icon_b64,
            is_focused,
            is_minimized,
        })
    }
}

pub fn enumerate_windows() -> Vec<WindowInfo> {
    let windows_list = Vec::new();
    let current_pid = unsafe { GetCurrentProcessId() };
    let fg_hwnd = unsafe { GetForegroundWindow() };

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let (list, fg_hwnd, current_pid) = &mut *(lparam.0 as *mut (Vec<WindowInfo>, HWND, u32));
        if let Some(info) = get_window_info(hwnd, *fg_hwnd, *current_pid) {
            list.push(info);
        }
        BOOL(1)
    }

    let mut state = (windows_list, fg_hwnd, current_pid);
    unsafe {
        let _ = EnumWindows(Some(enum_proc), LPARAM(&mut state as *mut _ as isize));
    }
    state.0
}

pub fn focus_window(hwnd_val: u64) {
    let hwnd = HWND(hwnd_val as *mut _);
    unsafe {
        if IsWindow(Some(hwnd)).as_bool() {
            if IsIconic(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            } else {
                let _ = ShowWindow(hwnd, SW_SHOW);
            }
            let _ = SetForegroundWindow(hwnd);
        }
    }
}

pub fn minimize_window(hwnd_val: u64) {
    let hwnd = HWND(hwnd_val as *mut _);
    unsafe {
        if IsWindow(Some(hwnd)).as_bool() {
            let _ = ShowWindow(hwnd, SW_MINIMIZE);
        }
    }
}

pub fn close_window(hwnd_val: u64) {
    let hwnd = HWND(hwnd_val as *mut _);
    unsafe {
        if IsWindow(Some(hwnd)).as_bool() {
            let _ = PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0));
        }
    }
}

pub fn snap_window(hwnd_val: u64, position: &str) {
    let hwnd = HWND(hwnd_val as *mut _);
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() {
            return;
        }

        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        }

        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };

        if GetMonitorInfoW(monitor, &mut mi).as_bool() {
            let rc = mi.rcWork;
            let work_w = rc.right - rc.left;
            let work_h = rc.bottom - rc.top;

            match position {
                "maximize" => {
                    let _ = ShowWindow(hwnd, SW_MAXIMIZE);
                }
                "restore" => {
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                }
                "left" => {
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                    let _ = SetWindowPos(
                        hwnd,
                        None,
                        rc.left,
                        rc.top,
                        work_w / 2,
                        work_h,
                        SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
                    );
                }
                "right" => {
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                    let _ = SetWindowPos(
                        hwnd,
                        None,
                        rc.left + work_w / 2,
                        rc.top,
                        work_w / 2,
                        work_h,
                        SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
                    );
                }
                "top-left" => {
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                    let _ = SetWindowPos(
                        hwnd,
                        None,
                        rc.left,
                        rc.top,
                        work_w / 2,
                        work_h / 2,
                        SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
                    );
                }
                "top-right" => {
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                    let _ = SetWindowPos(
                        hwnd,
                        None,
                        rc.left + work_w / 2,
                        rc.top,
                        work_w / 2,
                        work_h / 2,
                        SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
                    );
                }
                "bottom-left" => {
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                    let _ = SetWindowPos(
                        hwnd,
                        None,
                        rc.left,
                        rc.top + work_h / 2,
                        work_w / 2,
                        work_h / 2,
                        SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
                    );
                }
                "bottom-right" => {
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                    let _ = SetWindowPos(
                        hwnd,
                        None,
                        rc.left + work_w / 2,
                        rc.top + work_h / 2,
                        work_w / 2,
                        work_h / 2,
                        SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
                    );
                }
                "center" => {
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                    let target_w = (work_w * 7) / 10;
                    let target_h = (work_h * 7) / 10;
                    let target_x = rc.left + (work_w - target_w) / 2;
                    let target_y = rc.top + (work_h - target_h) / 2;
                    let _ = SetWindowPos(
                        hwnd,
                        None,
                        target_x,
                        target_y,
                        target_w,
                        target_h,
                        SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
                    );
                }
                _ => {}
            }

            let _ = SetForegroundWindow(hwnd);
        }
    }
}

unsafe extern "system" fn win_event_proc(
    _h_win_event_hook: HWINEVENTHOOK,
    _event: u32,
    _hwnd: HWND,
    _id_object: i32,
    _id_child: i32,
    _id_event_thread: u32,
    _dwms_event_time: u32,
) {
    if let Ok(guard) = EVENT_SENDER.lock() {
        if let Some(tx) = guard.as_ref() {
            let _ = tx.send(());
        }
    }
}

pub fn start(app_handle: AppHandle) {
    let (tx, rx) = channel::<()>();
    if let Ok(mut guard) = EVENT_SENDER.lock() {
        *guard = Some(tx);
    }

    let app_handle_broadcaster = app_handle.clone();
    thread::spawn(move || {
        crate::services::work_area::hide_native_taskbar();
        let _ = app_handle_broadcaster.emit("windows-updated", enumerate_windows());

        loop {
            // Purely event-driven wakeup with debounce
            match rx.recv() {
                Ok(_) => {
                    while rx.try_recv().is_ok() {}
                    thread::sleep(Duration::from_millis(60));
                    while rx.try_recv().is_ok() {}
                }
                Err(_) => break,
            }

            crate::services::work_area::hide_native_taskbar();
            let list = enumerate_windows();
            let _ = app_handle_broadcaster.emit("windows-updated", list);
        }
    });

    thread::spawn(move || unsafe {
        let hook_fg = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            None,
            Some(win_event_proc),
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
        );

        let hook_min = SetWinEventHook(
            EVENT_SYSTEM_MINIMIZESTART,
            EVENT_SYSTEM_MINIMIZEEND,
            None,
            Some(win_event_proc),
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
        );

        let hook_create = SetWinEventHook(
            EVENT_OBJECT_CREATE,
            EVENT_OBJECT_DESTROY,
            None,
            Some(win_event_proc),
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
        );

        let hook_name = SetWinEventHook(
            EVENT_OBJECT_NAMECHANGE,
            EVENT_OBJECT_NAMECHANGE,
            None,
            Some(win_event_proc),
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
        );

        let hook_cloak = SetWinEventHook(
            EVENT_OBJECT_CLOAKED,
            EVENT_OBJECT_UNCLOAKED,
            None,
            Some(win_event_proc),
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
        );

        let mut msg = MSG::default();
        while windows::Win32::UI::WindowsAndMessaging::GetMessageW(&mut msg, None, 0, 0)
            .as_bool()
        {
            let _ = windows::Win32::UI::WindowsAndMessaging::TranslateMessage(&msg);
            windows::Win32::UI::WindowsAndMessaging::DispatchMessageW(&msg);
        }

        let _ = UnhookWinEvent(hook_fg);
        let _ = UnhookWinEvent(hook_min);
        let _ = UnhookWinEvent(hook_create);
        let _ = UnhookWinEvent(hook_name);
        let _ = UnhookWinEvent(hook_cloak);
    });
}
