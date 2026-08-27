use windows::{
    core::{BOOL, PCWSTR},
    Win32::{
        Foundation::{HWND, RECT},
        System::Console::SetConsoleCtrlHandler,
        UI::WindowsAndMessaging::{
            FindWindowW, IsWindowVisible, SetWindowPos, ShowWindow, SystemParametersInfoW,
            HWND_TOPMOST, SPIF_SENDCHANGE, SPIF_UPDATEINIFILE, SPI_SETWORKAREA,
            SWP_HIDEWINDOW, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
            SWP_SHOWWINDOW, SW_HIDE, SW_SHOW,
        },
    },
};

pub fn reserve(top_notch_height: i32, bottom_bar_height: i32, screen_height: i32, screen_width: i32) {
    let mut work_area = RECT {
        left: 0,
        top: top_notch_height,
        right: screen_width,
        bottom: screen_height - bottom_bar_height,
    };
    unsafe {
        let _ = SystemParametersInfoW(
            SPI_SETWORKAREA,
            0,
            Some(&mut work_area as *mut RECT as *mut _),
            SPIF_SENDCHANGE | SPIF_UPDATEINIFILE,
        );
    }
}

pub fn restore(screen_height: i32, screen_width: i32) {
    let mut work_area = RECT {
        left: 0,
        top: 0,
        right: screen_width,
        bottom: screen_height,
    };
    unsafe {
        let _ = SystemParametersInfoW(
            SPI_SETWORKAREA,
            0,
            Some(&mut work_area as *mut RECT as *mut _),
            SPIF_SENDCHANGE | SPIF_UPDATEINIFILE,
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
            // 1. Bottom taskbar: (0, monitor_h - bar_height, monitor_w, monitor_h)
            // 2. Top dynamic island notch: (monitor_w / 2 - 220, 0, monitor_w / 2 + 220, 48)
            // Combined with RGN_OR so middle screen remains 100% click-through!
            let bar_top = monitor_h - bar_height;
            let rgn_bar = CreateRectRgn(0, bar_top, monitor_w, monitor_h);

            let island_half_w = 220;
            let island_left = (monitor_w / 2) - island_half_w;
            let island_right = (monitor_w / 2) + island_half_w;
            let rgn_island = CreateRectRgn(island_left, 0, island_right, 48);

            let rgn_combined = CreateRectRgn(0, 0, 0, 0);
            CombineRgn(Some(rgn_combined), Some(rgn_bar), Some(rgn_island), RGN_OR);
            let _ = SetWindowRgn(hwnd, Some(rgn_combined), true);
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
) {
    unsafe {
        // Position window across full monitor
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            monitor_x,
            monitor_y,
            monitor_w,
            monitor_h,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );

        // Hardware-clip mouse interaction region to only the bottom bar & top notch initially
        update_window_region(
            hwnd,
            monitor_w,
            monitor_h,
            bar_height_physical,
            false,
            0,
            0,
        );

        reserve(top_notch_physical, bar_height_physical, monitor_h, monitor_w);
        hide_native_taskbar();
    }
}

fn find_windows() -> Vec<HWND> {
    let mut list = Vec::new();
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
    list
}

pub fn hide_native_taskbar() {
    for hwnd in find_windows() {
        unsafe {
            if IsWindowVisible(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_HIDE);
                let _ = SetWindowPos(
                    hwnd,
                    None,
                    0,
                    10000,
                    0,
                    0,
                    SWP_HIDEWINDOW | SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOSIZE,
                );
            }
        }
    }
}

/// Always called on exit/panic/Ctrl+C — never leave the user without a taskbar.
pub fn restore_native_taskbar() {
    for hwnd in find_windows() {
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOW);
            let _ = SetWindowPos(
                hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_SHOWWINDOW | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER,
            );
        }
    }
}

unsafe extern "system" fn console_ctrl_handler(_ctrl_type: u32) -> BOOL {
    // Fired on CTRL+C (0), CTRL+BREAK (1), CLOSE (2), LOGOFF (5), SHUTDOWN (6)
    restore_native_taskbar();
    restore(1080, 1920);
    std::process::exit(0);
}

pub fn install_fail_safe() {
    unsafe {
        let _ = SetConsoleCtrlHandler(Some(console_ctrl_handler), true);
    }
}

