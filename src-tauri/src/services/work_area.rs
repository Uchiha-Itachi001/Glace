use std::sync::{atomic::{AtomicBool, Ordering}, Mutex};
use windows::{
    core::{BOOL, PCWSTR},
    Win32::{
        Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM},
        Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, RedrawWindow, MONITORINFO,
            MONITOR_DEFAULTTOPRIMARY, RDW_ALLCHILDREN, RDW_ERASE, RDW_FRAME,
            RDW_INVALIDATE, RDW_UPDATENOW,
        },
        System::Console::SetConsoleCtrlHandler,
        UI::Shell::{
            SHAppBarMessage, APPBARDATA, ABE_BOTTOM, ABE_LEFT, ABE_RIGHT, ABE_TOP,
            ABM_ACTIVATE, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE, ABM_SETPOS,
        },
        UI::WindowsAndMessaging::{
            CreateWindowExW, DefWindowProcW, DestroyWindow, EnumWindows, FindWindowW,
            GetClassNameW, GetSystemMetrics, GetWindowRect, IsWindowVisible, RegisterClassW,
            SendMessageTimeoutW, SetWindowPos, ShowWindow, HWND_BROADCAST, HWND_TOP,
            HWND_TOPMOST, SMTO_ABORTIFHUNG, SM_CXSCREEN, SM_CYSCREEN, SPI_SETWORKAREA,
            SWP_FRAMECHANGED, SWP_HIDEWINDOW, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
            SWP_NOZORDER, SWP_SHOWWINDOW, SW_HIDE, SW_RESTORE, SW_SHOW, WM_SETTINGCHANGE,
            WNDCLASSW, WS_EX_TOOLWINDOW, WS_POPUP,
        },
    },
};

pub static IS_SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);
static ORIGINAL_TRAY_RECTS: Mutex<Vec<(isize, RECT)>> = Mutex::new(Vec::new());

static TOP_APPBAR_HWND: Mutex<Option<isize>> = Mutex::new(None);
static BOTTOM_APPBAR_HWND: Mutex<Option<isize>> = Mutex::new(None);
static LEFT_APPBAR_HWND: Mutex<Option<isize>> = Mutex::new(None);
static RIGHT_APPBAR_HWND: Mutex<Option<isize>> = Mutex::new(None);

unsafe extern "system" fn appbar_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

fn get_or_create_appbar_window(name: &str) -> Option<HWND> {
    let wide_name: Vec<u16> = format!("GlaceAppBar_{}\0", name).encode_utf16().collect();
    let class_name = PCWSTR(wide_name.as_ptr());

    unsafe {
        let wnd_class = WNDCLASSW {
            lpfnWndProc: Some(appbar_wnd_proc),
            lpszClassName: class_name,
            ..Default::default()
        };
        let _ = RegisterClassW(&wnd_class);

        let hwnd = CreateWindowExW(
            WS_EX_TOOLWINDOW,
            class_name,
            class_name,
            WS_POPUP,
            0,
            0,
            0,
            0,
            None,
            None,
            None,
            None,
        ).ok()?;

        Some(hwnd)
    }
}

fn update_appbar_edge(
    name: &str,
    edge: u32,
    slot: &Mutex<Option<isize>>,
    thickness: i32,
    rect: RECT,
) {
    if let Ok(mut guard) = slot.lock() {
        if thickness > 0 {
            let hwnd = match *guard {
                Some(h) => HWND(h as *mut _),
                None => {
                    if let Some(h) = get_or_create_appbar_window(name) {
                        let mut abd = APPBARDATA {
                            cbSize: std::mem::size_of::<APPBARDATA>() as u32,
                            hWnd: h,
                            uCallbackMessage: 0,
                            uEdge: edge,
                            rc: rect,
                            lParam: LPARAM(0),
                        };
                        unsafe {
                            let _ = SHAppBarMessage(ABM_NEW, &mut abd);
                        }
                        *guard = Some(h.0 as isize);
                        h
                    } else {
                        return;
                    }
                }
            };

            let mut abd = APPBARDATA {
                cbSize: std::mem::size_of::<APPBARDATA>() as u32,
                hWnd: hwnd,
                uCallbackMessage: 0,
                uEdge: edge,
                rc: rect,
                lParam: LPARAM(0),
            };
            unsafe {
                let _ = SHAppBarMessage(ABM_QUERYPOS, &mut abd);
                let mut final_rc = rect;
                match edge {
                    ABE_TOP => final_rc.bottom = final_rc.top + thickness,
                    ABE_BOTTOM => final_rc.top = final_rc.bottom - thickness,
                    ABE_LEFT => final_rc.right = final_rc.left + thickness,
                    ABE_RIGHT => final_rc.left = final_rc.right - thickness,
                    _ => {}
                }
                abd.rc = final_rc;
                let _ = SHAppBarMessage(ABM_SETPOS, &mut abd);
                let _ = SetWindowPos(
                    hwnd,
                    None,
                    abd.rc.left,
                    abd.rc.top,
                    abd.rc.right - abd.rc.left,
                    abd.rc.bottom - abd.rc.top,
                    SWP_NOACTIVATE | SWP_NOZORDER,
                );
            }
        } else if let Some(h) = guard.take() {
            let hwnd = HWND(h as *mut _);
            let mut abd = APPBARDATA {
                cbSize: std::mem::size_of::<APPBARDATA>() as u32,
                hWnd: hwnd,
                ..Default::default()
            };
            unsafe {
                let _ = SHAppBarMessage(ABM_REMOVE, &mut abd);
                let _ = DestroyWindow(hwnd);
            }
        }
    }
}

/// Reserves custom 4-sided margins for the desktop work area via Windows Shell AppBars.
pub fn reserve_margins(
    margin_top: i32,
    margin_bottom: i32,
    margin_left: i32,
    margin_right: i32,
    monitor_x: i32,
    monitor_y: i32,
    screen_width: i32,
    screen_height: i32,
) {
    let screen_w = if screen_width > 0 {
        screen_width
    } else {
        unsafe { GetSystemMetrics(SM_CXSCREEN) }
    };
    let screen_h = if screen_height > 0 {
        screen_height
    } else {
        unsafe { GetSystemMetrics(SM_CYSCREEN) }
    };

    // 1. Update native Windows Shell AppBars for all 4 edges
    update_appbar_edge(
        "Top",
        ABE_TOP,
        &TOP_APPBAR_HWND,
        margin_top,
        RECT {
            left: monitor_x,
            top: monitor_y,
            right: monitor_x + screen_w,
            bottom: monitor_y + margin_top,
        },
    );

    update_appbar_edge(
        "Bottom",
        ABE_BOTTOM,
        &BOTTOM_APPBAR_HWND,
        margin_bottom,
        RECT {
            left: monitor_x,
            top: monitor_y + screen_h - margin_bottom,
            right: monitor_x + screen_w,
            bottom: monitor_y + screen_h,
        },
    );

    update_appbar_edge(
        "Left",
        ABE_LEFT,
        &LEFT_APPBAR_HWND,
        margin_left,
        RECT {
            left: monitor_x,
            top: monitor_y,
            right: monitor_x + margin_left,
            bottom: monitor_y + screen_h,
        },
    );

    update_appbar_edge(
        "Right",
        ABE_RIGHT,
        &RIGHT_APPBAR_HWND,
        margin_right,
        RECT {
            left: monitor_x + screen_w - margin_right,
            top: monitor_y,
            right: monitor_x + screen_w,
            bottom: monitor_y + screen_h,
        },
    );

    // 2. Broadcast WM_SETTINGCHANGE to all windows
    let mut result = 0usize;
    unsafe {
        let _ = SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            WPARAM(SPI_SETWORKAREA.0 as usize),
            LPARAM(0),
            SMTO_ABORTIFHUNG,
            100,
            Some(&mut result),
        );
    }
}

#[allow(dead_code)]
pub fn reserve(top_notch_height: i32, bottom_bar_height: i32, screen_height: i32, screen_width: i32) {
    reserve_margins(
        top_notch_height,
        bottom_bar_height,
        0,
        0,
        0,
        0,
        screen_width,
        screen_height,
    );
}

pub fn restore(_screen_height: i32, _screen_width: i32) {
    // Remove all 4 AppBars to restore full desktop work area
    update_appbar_edge("Top", ABE_TOP, &TOP_APPBAR_HWND, 0, RECT::default());
    update_appbar_edge("Bottom", ABE_BOTTOM, &BOTTOM_APPBAR_HWND, 0, RECT::default());
    update_appbar_edge("Left", ABE_LEFT, &LEFT_APPBAR_HWND, 0, RECT::default());
    update_appbar_edge("Right", ABE_RIGHT, &RIGHT_APPBAR_HWND, 0, RECT::default());

    let mut result = 0usize;
    unsafe {
        let _ = SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            WPARAM(SPI_SETWORKAREA.0 as usize),
            LPARAM(0),
            SMTO_ABORTIFHUNG,
            100,
            Some(&mut result),
        );
    }
}

pub fn update_window_region(
    hwnd: HWND,
    monitor_w: i32,
    monitor_h: i32,
    bar_height: i32,
    flyout_expanded: bool,
    _flyout_w: i32,
    _flyout_h: i32,
) {
    use windows::Win32::Graphics::Gdi::{CombineRgn, CreateRectRgn, SetWindowRgn, RGN_OR};

    unsafe {
        if flyout_expanded {
            // Expand region to full monitor so flyouts, context menus, expanded island, and backdrop clicks work
            let rgn_full = CreateRectRgn(0, 0, monitor_w, monitor_h);
            let _ = SetWindowRgn(hwnd, Some(rgn_full), true);
        } else {
            // Composite hardware region:
            // 1. Bottom taskbar / macOS dock: (0, monitor_h - bar_height, monitor_w, monitor_h)
            // 2. Top header / Dynamic Island:
            //    - In macOS mode: full top bar (0, 0, monitor_w, 36)
            //    - In Windows mode: ONLY center notch area (420px wide centered at top)
            //      leaving the left & right (Minimize, Maximize, Close buttons, window tabs) 100% click-through!
            let bar_top = monitor_h - bar_height;
            let rgn_bar = CreateRectRgn(0, bar_top, monitor_w, monitor_h);

            let settings = crate::config::settings::load();
            let is_macos_mode = settings.bar_position == "macos" || settings.bar_position == "top";

            let rgn_top = if is_macos_mode {
                CreateRectRgn(0, 0, monitor_w, 38)
            } else if settings.enable_dynamic_island {
                let notch_w = 236;
                let notch_left = ((monitor_w - notch_w) / 2).max(0);
                let notch_right = (notch_left + notch_w).min(monitor_w);
                CreateRectRgn(notch_left, 0, notch_right, 40)
            } else {
                CreateRectRgn(0, 0, 0, 0)
            };

            let rgn_combined = CreateRectRgn(0, 0, 0, 0);
            CombineRgn(Some(rgn_combined), Some(rgn_bar), Some(rgn_top), RGN_OR);
            let _ = SetWindowRgn(hwnd, Some(rgn_combined), true);
        }
    }
}

#[derive(Clone, Copy, Debug)]
#[allow(dead_code)]
pub struct GlaceWindowConfig {
    pub hwnd: isize,
    pub monitor_x: i32,
    pub monitor_y: i32,
    pub monitor_w: i32,
    pub monitor_h: i32,
    pub bar_height_physical: i32,
    pub top_notch_physical: i32,
    pub is_hidden_by_fullscreen: bool,
}

static GLACE_CONFIG: std::sync::Mutex<Option<GlaceWindowConfig>> = std::sync::Mutex::new(None);

pub fn get_glace_hwnd() -> Option<HWND> {
    if let Ok(guard) = GLACE_CONFIG.lock() {
        guard.map(|c| HWND(c.hwnd as *mut _))
    } else {
        None
    }
}

pub fn set_fullscreen_hidden(hide: bool) {
    let mut config_opt = match GLACE_CONFIG.lock() {
        Ok(g) => g,
        Err(_) => return,
    };

    if let Some(config) = config_opt.as_mut() {
        if config.is_hidden_by_fullscreen == hide {
            return;
        }
        config.is_hidden_by_fullscreen = hide;
        let hwnd = HWND(config.hwnd as *mut _);
        let x = config.monitor_x;
        let y = config.monitor_y;
        let w = config.monitor_w;
        let h = config.monitor_h;
        let bar_h = config.bar_height_physical;

        unsafe {
            if hide {
                let _ = ShowWindow(hwnd, SW_HIDE);
                let _ = SetWindowPos(
                    hwnd,
                    None,
                    0,
                    0,
                    0,
                    0,
                    SWP_HIDEWINDOW | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
                );
            } else {
                let _ = ShowWindow(hwnd, SW_SHOW);
                let _ = SetWindowPos(
                    hwnd,
                    Some(HWND_TOPMOST),
                    x,
                    y,
                    w,
                    h,
                    SWP_SHOWWINDOW | SWP_NOACTIVATE,
                );
                update_window_region(hwnd, w, h, bar_h, false, 0, 0);
                hide_native_taskbar();
            }
        }
    }
}

pub fn pin_window_to_bottom(
    hwnd: HWND,
    monitor_x: i32,
    monitor_y: i32,
    monitor_w: i32,
    monitor_h: i32,
    bar_height_physical: i32,
    top_notch_physical: i32,
    margin_left_physical: i32,
    margin_right_physical: i32,
) {
    if let Ok(mut guard) = GLACE_CONFIG.lock() {
        *guard = Some(GlaceWindowConfig {
            hwnd: hwnd.0 as isize,
            monitor_x,
            monitor_y,
            monitor_w,
            monitor_h,
            bar_height_physical,
            top_notch_physical,
            is_hidden_by_fullscreen: false,
        });
    }

    unsafe {
        // 1. Hide native taskbar FIRST so Explorer's internal shell hook triggers and finishes
        hide_native_taskbar();

        // 2. Short sleep to allow Explorer to settle
        std::thread::sleep(std::time::Duration::from_millis(50));

        // 3. Position Glace window across full monitor
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            monitor_x,
            monitor_y,
            monitor_w,
            monitor_h,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );

        // 4. Hardware-clip mouse interaction region to only the bottom bar & top notch initially
        update_window_region(
            hwnd,
            monitor_w,
            monitor_h,
            bar_height_physical,
            false,
            0,
            0,
        );

        // 5. Reserve work area with exact monitor offsets & margins via Windows Shell AppBars
        reserve_margins(
            top_notch_physical,
            bar_height_physical,
            margin_left_physical,
            margin_right_physical,
            monitor_x,
            monitor_y,
            monitor_w,
            monitor_h,
        );
    }
}

unsafe extern "system" fn enum_taskbar_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let list = &mut *(lparam.0 as *mut Vec<HWND>);
    let mut class_name = [0u16; 256];
    let len = GetClassNameW(hwnd, &mut class_name);
    if len > 0 {
        let name = String::from_utf16_lossy(&class_name[..len as usize]);
        if name == "Shell_TrayWnd" || name == "Shell_SecondaryTrayWnd" {
            list.push(hwnd);
        }
    }
    BOOL(1)
}

fn find_windows() -> Vec<HWND> {
    let mut list = Vec::new();
    unsafe {
        let _ = EnumWindows(
            Some(enum_taskbar_windows_proc),
            LPARAM(&mut list as *mut _ as isize),
        );
    }
    if list.is_empty() {
        let class_primary: Vec<u16> = "Shell_TrayWnd\0".encode_utf16().collect();
        let class_sec: Vec<u16> = "Shell_SecondaryTrayWnd\0".encode_utf16().collect();

        unsafe {
            if let Ok(hwnd) = FindWindowW(PCWSTR(class_primary.as_ptr()), PCWSTR::null()) {
                if !hwnd.0.is_null() {
                    list.push(hwnd);
                }
            }
            if let Ok(hwnd) = FindWindowW(PCWSTR(class_sec.as_ptr()), PCWSTR::null()) {
                if !hwnd.0.is_null() {
                    list.push(hwnd);
                }
            }
        }
    }
    list
}

pub fn hide_native_taskbar() {
    if IS_SHUTTING_DOWN.load(Ordering::SeqCst) {
        return;
    }

    for hwnd in find_windows() {
        unsafe {
            let mut rc = RECT::default();
            let _ = GetWindowRect(hwnd, &mut rc);
            if rc.bottom > rc.top && rc.right > rc.left && rc.top < 5000 {
                if let Ok(mut guard) = ORIGINAL_TRAY_RECTS.lock() {
                    if !guard.iter().any(|(h, _)| *h == hwnd.0 as isize) {
                        guard.push((hwnd.0 as isize, rc));
                    }
                }
            }

            let _ = ShowWindow(hwnd, SW_HIDE);
        }
    }
}

/// Proactively ensures Windows native taskbar remains hidden if Explorer attempts to unhide it via Auto-Hide edge hover.
pub fn ensure_native_taskbar_hidden() {
    if IS_SHUTTING_DOWN.load(Ordering::SeqCst) {
        return;
    }

    for hwnd in find_windows() {
        unsafe {
            if IsWindowVisible(hwnd).as_bool() {
                hide_native_taskbar();
                break;
            }
        }
    }
}

/// Always called on exit/panic/Ctrl+C/close — reliably restores the native taskbar to its exact screen position across all monitors.
pub fn restore_native_taskbar() {
    IS_SHUTTING_DOWN.store(true, Ordering::SeqCst);

    let cached_rects = if let Ok(guard) = ORIGINAL_TRAY_RECTS.lock() {
        guard.clone()
    } else {
        Vec::new()
    };

    for hwnd in find_windows() {
        unsafe {
            let orig_rc = cached_rects
                .iter()
                .find(|(h, _)| *h == hwnd.0 as isize)
                .map(|(_, rc)| *rc);

            let target_rc = if let Some(rc) = orig_rc {
                rc
            } else {
                let hmonitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTOPRIMARY);
                let mut mi = MONITORINFO {
                    cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                    ..Default::default()
                };
                if GetMonitorInfoW(hmonitor, &mut mi).as_bool() {
                    RECT {
                        left: mi.rcMonitor.left,
                        top: mi.rcMonitor.bottom - 48,
                        right: mi.rcMonitor.right,
                        bottom: mi.rcMonitor.bottom,
                    }
                } else {
                    let sw = GetSystemMetrics(SM_CXSCREEN);
                    let sh = GetSystemMetrics(SM_CYSCREEN);
                    RECT {
                        left: 0,
                        top: sh - 48,
                        right: sw,
                        bottom: sh,
                    }
                }
            };

            let w = target_rc.right - target_rc.left;
            let h = target_rc.bottom - target_rc.top;

            // 1. Move back onto screen and show
            let _ = SetWindowPos(
                hwnd,
                Some(HWND_TOP),
                target_rc.left,
                target_rc.top,
                w,
                h,
                SWP_SHOWWINDOW | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );

            // 2. Unhide using both SW_SHOW and SW_RESTORE
            let _ = ShowWindow(hwnd, SW_SHOW);
            let _ = ShowWindow(hwnd, SW_RESTORE);

            // 3. Reactivate AppBar with Windows Shell
            let mut abd = APPBARDATA {
                cbSize: std::mem::size_of::<APPBARDATA>() as u32,
                hWnd: hwnd,
                ..Default::default()
            };
            let _ = SHAppBarMessage(ABM_ACTIVATE, &mut abd);

            // 4. Invalidate & force redraw of taskbar window & all its children
            let _ = RedrawWindow(
                Some(hwnd),
                None,
                None,
                RDW_INVALIDATE | RDW_ERASE | RDW_UPDATENOW | RDW_ALLCHILDREN | RDW_FRAME,
            );
        }
    }
}

unsafe extern "system" fn console_ctrl_handler(_ctrl_type: u32) -> BOOL {
    // Fired on CTRL+C (0), CTRL+BREAK (1), CLOSE (2), LOGOFF (5), SHUTDOWN (6)
    restore_native_taskbar();
    restore(0, 0);
    std::thread::sleep(std::time::Duration::from_millis(100));
    BOOL(0)
}

pub fn install_fail_safe() {
    unsafe {
        let _ = SetConsoleCtrlHandler(Some(console_ctrl_handler), true);
    }
}


