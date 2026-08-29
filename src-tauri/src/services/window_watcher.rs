use std::collections::HashMap;
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use windows::core::{BOOL, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::{
    DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS,
};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, GetMonitorInfoW,
    MonitorFromWindow, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    DIB_RGB_COLORS, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::System::ProcessStatus::K32GetModuleFileNameExW;
use windows::Win32::System::Threading::{
    AttachThreadInput, GetCurrentProcessId, GetCurrentThreadId, OpenProcess,
    PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE, TerminateProcess,
};
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::Shell::{
    ExtractIconExW, SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON,
};
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, DestroyIcon, DrawIconEx, EnumChildWindows, EnumWindows,
    GetAncestor, GetClassLongPtrW, GetClassNameW, GetForegroundWindow, GetWindow, GetWindowLongW,
    GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindow,
    IsWindowVisible, PostMessageW, SendMessageTimeoutW, SetForegroundWindow, SetWindowPos,
    ShowWindow, DI_NORMAL, EVENT_OBJECT_CLOAKED, EVENT_OBJECT_CREATE, EVENT_OBJECT_DESTROY,
    EVENT_OBJECT_UNCLOAKED, EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_MINIMIZEEND,
    EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MOVESIZEEND, GA_ROOT, GCLP_HICON, GCLP_HICONSM,
    GWL_EXSTYLE, GWL_STYLE, GW_OWNER, HICON, MSG, SMTO_ABORTIFHUNG, SWP_FRAMECHANGED,
    SWP_NOZORDER, SWP_SHOWWINDOW, SW_MAXIMIZE, SW_MINIMIZE, SW_RESTORE, SW_SHOW,
    WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS, WM_CLOSE, WM_GETICON, WS_CHILD,
    WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};

use crate::models::types::WindowInfo;

static EVENT_SENDER: Mutex<Option<Sender<()>>> = Mutex::new(None);
static ICON_CACHE: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);
static PID_CACHE: Mutex<Option<HashMap<u32, (String, String)>>> = Mutex::new(None);

pub fn is_taskbar_window(hwnd: HWND, current_pid: u32) -> bool {
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() || !IsWindowVisible(hwnd).as_bool() {
            return false;
        }

        // Fast rejection: child windows are never taskbar windows
        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        if (style & WS_CHILD.0) != 0 {
            return false;
        }

        // Fast rejection: windows without title text
        let length = GetWindowTextLengthW(hwnd);
        if length == 0 {
            return false;
        }

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == current_pid || pid == 0 {
            return false;
        }

        let mut class_buf = [0u16; 256];
        let class_len = GetClassNameW(hwnd, &mut class_buf);
        let class_name = if class_len > 0 {
            String::from_utf16_lossy(&class_buf[..class_len as usize])
        } else {
            String::new()
        };

        // System shell & background windows that should never be in taskbar
        if class_name == "Progman"
            || class_name == "WorkerW"
            || class_name == "Shell_TrayWnd"
            || class_name == "Shell_SecondaryTrayWnd"
        {
            return false;
        }

        // Top-level desktop windows like File Explorer (CabinetWClass, ExplorerFrame)
        let is_known_app_class = class_name == "CabinetWClass"
            || class_name == "ExplorerFrame"
            || class_name == "CASCADIA_HOSTING_WINDOW_CLASS"
            || class_name == "ApplicationFrameWindow";

        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        let is_tool_window = (ex_style & WS_EX_TOOLWINDOW.0) != 0;
        let is_app_window = (ex_style & WS_EX_APPWINDOW.0) != 0;

        if is_tool_window && !is_app_window && !is_known_app_class {
            return false;
        }

        if !is_known_app_class {
            if let Ok(owner) = GetWindow(hwnd, GW_OWNER) {
                if !owner.0.is_null() && !is_app_window {
                    return false;
                }
            }
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

fn get_window_icon(hwnd: HWND, exe_path: &str, exe_name: &str) -> String {
    unsafe {
        let is_browser = {
            let n = exe_name.to_lowercase();
            n.contains("msedge") || n.contains("chrome") || n.contains("brave") || n.contains("opera") || n.contains("vivaldi")
        };

        // 1. For browsers/PWAs, ALWAYS query live HWND icon first (captures PWA icons: Manus, DeepSeek, Claude, YouTube Music, WhatsApp, etc.)
        let mut found_b64: Option<String> = None;

        if !hwnd.0.is_null() {
            for icon_type in [1usize, 2, 0] {
                let mut result: usize = 0;
                let res = SendMessageTimeoutW(
                    hwnd,
                    WM_GETICON,
                    WPARAM(icon_type),
                    LPARAM(0),
                    SMTO_ABORTIFHUNG,
                    8,
                    Some(&mut result),
                );
                if res.0 != 0 && result != 0 {
                    let hicon = HICON(result as *mut _);
                    found_b64 = hicon_to_base64_png(hicon);
                    if found_b64.is_some() {
                        break;
                    }
                }
            }

            if found_b64.is_none() {
                let icon_lg = GetClassLongPtrW(hwnd, GCLP_HICON);
                if icon_lg != 0 {
                    let hicon = HICON(icon_lg as *mut _);
                    found_b64 = hicon_to_base64_png(hicon);
                }
            }

            if found_b64.is_none() {
                let icon_sm = GetClassLongPtrW(hwnd, GCLP_HICONSM);
                if icon_sm != 0 {
                    let hicon = HICON(icon_sm as *mut _);
                    found_b64 = hicon_to_base64_png(hicon);
                }
            }
        }

        if let Some(b64) = found_b64 {
            return b64;
        }

        // 2. Fast-path: Check in-memory icon cache for standard non-browser applications
        let cache_key = if !exe_path.is_empty() {
            exe_path
        } else {
            exe_name
        };

        if !is_browser && !cache_key.is_empty() {
            if let Ok(guard) = ICON_CACHE.lock() {
                if let Some(cache) = guard.as_ref() {
                    if let Some(cached) = cache.get(cache_key) {
                        return cached.clone();
                    }
                }
            }
        }

        // 3. Fallback: Extract from executable file path
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
                found_b64 = hicon_to_base64_png(icon_to_use);
                if !small_icon.0.is_null() {
                    let _ = DestroyIcon(small_icon);
                }
                if !large_icon.0.is_null() {
                    let _ = DestroyIcon(large_icon);
                }
            }

            if found_b64.is_none() {
                let mut shfi = SHFILEINFOW::default();
                let res = SHGetFileInfoW(
                    PCWSTR(exe_w.as_ptr()),
                    Default::default(),
                    Some(&mut shfi),
                    std::mem::size_of::<SHFILEINFOW>() as u32,
                    SHGFI_ICON | SHGFI_LARGEICON,
                );
                if res != 0 && !shfi.hIcon.0.is_null() {
                    found_b64 = hicon_to_base64_png(shfi.hIcon);
                    let _ = DestroyIcon(shfi.hIcon);
                }
            }
        }

        let b64_final = found_b64.unwrap_or_default();

        if !is_browser && !b64_final.is_empty() && !cache_key.is_empty() {
            if let Ok(mut guard) = ICON_CACHE.lock() {
                let cache = guard.get_or_insert_with(HashMap::new);
                cache.insert(cache_key.to_string(), b64_final.clone());
            }
        }

        b64_final
    }
}

fn get_window_exe_path(hwnd: HWND) -> (String, String) {
    let mut pid: u32 = 0;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    if pid == 0 {
        return (String::new(), String::new());
    }

    if let Ok(guard) = PID_CACHE.lock() {
        if let Some(cache) = guard.as_ref() {
            if let Some(cached) = cache.get(&pid) {
                return cached.clone();
            }
        }
    }

    let result = unsafe {
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
                    (exe_name, full_path)
                } else {
                    (String::new(), String::new())
                }
            } else {
                (String::new(), String::new())
            }
        } else {
            (String::new(), String::new())
        }
    };

    if !result.0.is_empty() {
        if let Ok(mut guard) = PID_CACHE.lock() {
            let cache = guard.get_or_insert_with(HashMap::new);
            cache.insert(pid, result.clone());
        }
    }

    result
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
        let icon_b64 = get_window_icon(hwnd, &exe_path, &exe_name);
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
        if !IsWindow(Some(hwnd)).as_bool() {
            return;
        }

        let fg_hwnd = GetForegroundWindow();
        let fg_thread = GetWindowThreadProcessId(fg_hwnd, None);
        let cur_thread = GetCurrentThreadId();

        let attached = if fg_thread != 0 && fg_thread != cur_thread {
            AttachThreadInput(cur_thread, fg_thread, true).as_bool()
        } else {
            false
        };

        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        } else {
            let _ = ShowWindow(hwnd, SW_SHOW);
        }

        let _ = SetForegroundWindow(hwnd);
        let _ = BringWindowToTop(hwnd);

        if attached {
            let _ = AttachThreadInput(cur_thread, fg_thread, false);
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

pub fn terminate_window_process(hwnd_val: u64) {
    let hwnd = HWND(hwnd_val as *mut _);
    unsafe {
        if IsWindow(Some(hwnd)).as_bool() {
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid != 0 {
                // Check process name to protect critical Windows system processes
                let is_critical_process = if let Ok(process) =
                    OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
                {
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
                                .to_lowercase();
                            matches!(
                                exe_name.as_str(),
                                "explorer.exe"
                                    | "dwm.exe"
                                    | "csrss.exe"
                                    | "lsass.exe"
                                    | "services.exe"
                                    | "winlogon.exe"
                                    | "svchost.exe"
                                    | "startmenuexperiencehost.exe"
                                    | "shellexperiencehost.exe"
                                    | "searchhost.exe"
                            )
                        } else {
                            false
                        }
                    } else {
                        false
                    }
                } else {
                    false
                };

                // NEVER terminate Windows Explorer shell or system processes — close the single window gracefully
                if is_critical_process {
                    let _ = PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0));
                    return;
                }

                if let Ok(process) = OpenProcess(PROCESS_TERMINATE, false, pid) {
                    if !process.0.is_null() {
                        let _ = TerminateProcess(process, 1);
                        let _ = windows::Win32::Foundation::CloseHandle(process);
                    }
                }
            }
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
    event: u32,
    hwnd: HWND,
    id_object: i32,
    id_child: i32,
    _id_event_thread: u32,
    _dwms_event_time: u32,
) {
    // Filter out internal UI controls (buttons, tooltips, carets, list items)
    // OBJID_WINDOW is 0, OBJID_CLIENT is -4. Only trigger for top-level window events
    if id_object != 0 && id_object != -4 {
        return;
    }
    if id_child != 0 {
        return;
    }
    if hwnd.0.is_null() {
        return;
    }

    crate::services::flyout_tracker::on_win_event(event, hwnd);

    if let Ok(guard) = EVENT_SENDER.lock() {
        if let Some(tx) = guard.as_ref() {
            let _ = tx.send(());
        }
    }
}

pub fn is_foreground_fullscreen(glace_hwnd: HWND, current_pid: u32) -> bool {
    unsafe {
        let mut fg = GetForegroundWindow();
        if fg.0.is_null() {
            return false;
        }

        if fg == glace_hwnd {
            return false;
        }

        let mut fg_pid: u32 = 0;
        GetWindowThreadProcessId(fg, Some(&mut fg_pid));
        if fg_pid == 0 || fg_pid == current_pid {
            return false;
        }

        let root = GetAncestor(fg, GA_ROOT);
        if !root.0.is_null() && root != fg {
            let mut root_pid: u32 = 0;
            GetWindowThreadProcessId(root, Some(&mut root_pid));
            if root_pid == current_pid || root == glace_hwnd {
                return false;
            }
            fg = root;
        }

        if !IsWindow(Some(fg)).as_bool() || !IsWindowVisible(fg).as_bool() || IsIconic(fg).as_bool() {
            return false;
        }

        let mut cloaked: u32 = 0;
        let _ = DwmGetWindowAttribute(
            fg,
            DWMWA_CLOAKED,
            &mut cloaked as *mut _ as *mut std::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        );
        if cloaked != 0 {
            return false;
        }

        let mut class_buf = [0u16; 256];
        let class_len = GetClassNameW(fg, &mut class_buf);
        if class_len > 0 {
            let class_name = String::from_utf16_lossy(&class_buf[..class_len as usize]);
            let class_lower = class_name.to_lowercase();
            if class_name == "Progman"
                || class_name == "WorkerW"
                || class_name == "Shell_TrayWnd"
                || class_name == "Shell_SecondaryTrayWnd"
                || class_name == "Windows.UI.Core.CoreWindow"
                || class_name == "XamlExplorerHostIslandWindow"
                || class_name == "MultitaskingViewFrame"
                || class_name == "Shell_LightDismissOverlayWindow"
                || class_lower.contains("snipping")
                || class_lower.contains("clipping")
                || class_lower.contains("screensketch")
                || class_lower.contains("directui")
                || class_lower.contains("overlay")
            {
                return false;
            }
        }

        // Query the executable name of the foreground window to ignore screenshot & system tools
        if let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, fg_pid) {
            if !process.0.is_null() {
                let mut path_buf = [0u16; 512];
                let len = K32GetModuleFileNameExW(Some(process), None, &mut path_buf);
                let _ = windows::Win32::Foundation::CloseHandle(process);
                if len > 0 {
                    let full_path = String::from_utf16_lossy(&path_buf[..len as usize]);
                    let exe_name = std::path::Path::new(&full_path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_lowercase();

                    if exe_name == "screenclippinghost.exe"
                        || exe_name == "snippingtool.exe"
                        || exe_name == "screensketch.exe"
                        || exe_name == "snippingtoolapp.exe"
                        || exe_name == "explorer.exe"
                        || exe_name == "searchhost.exe"
                        || exe_name == "startmenuexperiencehost.exe"
                        || exe_name == "shellexperiencehost.exe"
                        || exe_name == "lockapp.exe"
                        || exe_name == "gamebar.exe"
                        || exe_name == "gamebarftserver.exe"
                        || exe_name == "bcastdvr.exe"
                        || exe_name == "textinputhost.exe"
                        || exe_name == "taskmgr.exe"
                        || exe_name == "snipaste.exe"
                        || exe_name == "sharex.exe"
                        || exe_name == "lightshot.exe"
                        || exe_name == "flameshot.exe"
                        || exe_name == "greenshot.exe"
                    {
                        return false;
                    }
                }
            }
        }

        let fg_monitor = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
        let glace_monitor = MonitorFromWindow(glace_hwnd, MONITOR_DEFAULTTONEAREST);
        if fg_monitor != glace_monitor {
            return false;
        }

        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(fg_monitor, &mut mi).as_bool() {
            return false;
        }

        let mon_rect = mi.rcMonitor;

        let mut rc = RECT::default();
        let hr = DwmGetWindowAttribute(
            fg,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut rc as *mut _ as *mut std::ffi::c_void,
            std::mem::size_of::<RECT>() as u32,
        );
        if hr.is_err() || (rc.right - rc.left <= 0) || (rc.bottom - rc.top <= 0) {
            let _ = windows::Win32::UI::WindowsAndMessaging::GetWindowRect(fg, &mut rc);
        }

        rc.left <= mon_rect.left
            && rc.top <= mon_rect.top
            && rc.right >= mon_rect.right
            && rc.bottom >= mon_rect.bottom
    }
}

pub fn start(app_handle: AppHandle) {
    let (tx, rx) = channel::<()>();
    if let Ok(mut guard) = EVENT_SENDER.lock() {
        *guard = Some(tx);
    }

    // Dedicated high-responsiveness fullscreen monitoring loop
    thread::spawn(move || {
        let current_pid = unsafe { GetCurrentProcessId() };
        let mut last_fullscreen_state = false;

        loop {
            thread::sleep(Duration::from_millis(100));

            if let Some(glace_hwnd) = crate::services::work_area::get_glace_hwnd() {
                let is_fs = is_foreground_fullscreen(glace_hwnd, current_pid);
                if is_fs != last_fullscreen_state {
                    last_fullscreen_state = is_fs;
                    crate::services::work_area::set_fullscreen_hidden(is_fs);
                }
            }
        }
    });

    let app_handle_broadcaster = app_handle.clone();
    thread::spawn(move || {
        let mut last_list: Vec<WindowInfo> = enumerate_windows();
        let _ = app_handle_broadcaster.emit("windows-updated", &last_list);

        loop {
            // Event-driven wakeup with debounce (250ms avoids enum thrashing during rapid resize/drag)
            match rx.recv() {
                Ok(_) => {
                    while rx.try_recv().is_ok() {}
                    thread::sleep(Duration::from_millis(250));
                    while rx.try_recv().is_ok() {}
                }
                Err(_) => break,
            }

            let new_list = enumerate_windows();
            // Only emit to frontend if window state actually changed!
            if new_list != last_list {
                let _ = app_handle_broadcaster.emit("windows-updated", &new_list);
                last_list = new_list;
            }
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

        let hook_movesize = SetWinEventHook(
            EVENT_SYSTEM_MOVESIZEEND,
            EVENT_SYSTEM_MOVESIZEEND,
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
        let _ = UnhookWinEvent(hook_movesize);
        let _ = UnhookWinEvent(hook_min);
        let _ = UnhookWinEvent(hook_create);
        let _ = UnhookWinEvent(hook_cloak);
    });
}

