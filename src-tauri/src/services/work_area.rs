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

pub fn reserve(bar_height: i32, screen_height: i32, screen_width: i32) {
    let mut work_area = RECT {
        left: 0,
        top: 0,
        right: screen_width,
        bottom: screen_height - bar_height,
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
    flyout_w: i32,
    flyout_h: i32,
) {
    use windows::Win32::Graphics::Gdi::{
        CombineRgn, CreateRectRgn, DeleteObject, SetWindowRgn, RGN_OR,
    };

    unsafe {
        let bar_top = monitor_h - bar_height;
        let rgn_bar = CreateRectRgn(0, bar_top, monitor_w, monitor_h);

        if flyout_expanded {
            let fw = if flyout_w > 0 { flyout_w } else { 620 };
            let fh = if flyout_h > 0 { flyout_h } else { 520 };

            let flyout_left = monitor_w - fw - 24;
            let flyout_top = bar_top - fh - 10;
            let flyout_right = monitor_w - 20;
            let flyout_bottom = bar_top - 4;

            let rgn_flyout = CreateRectRgn(flyout_left, flyout_top, flyout_right, flyout_bottom);
            let rgn_combined = CreateRectRgn(0, 0, 0, 0);
            let _ = CombineRgn(
                Some(rgn_combined),
                Some(rgn_bar),
                Some(rgn_flyout),
                RGN_OR,
            );

            let _ = SetWindowRgn(hwnd, Some(rgn_combined), false);
            let _ = DeleteObject(rgn_bar.into());
            let _ = DeleteObject(rgn_flyout.into());
        } else {
            let _ = SetWindowRgn(hwnd, Some(rgn_bar), false);
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
) {
    unsafe {
        // Position window across full monitor so swapchain never needs resizing
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            monitor_x,
            monitor_y,
            monitor_w,
            monitor_h,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );

        // Hardware-clip mouse interaction region to only the bottom bar initially
        update_window_region(
            hwnd,
            monitor_w,
            monitor_h,
            bar_height_physical,
            false,
            0,
            0,
        );

        reserve(bar_height_physical, monitor_h, monitor_w);
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

