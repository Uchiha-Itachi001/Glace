use windows::{
    core::{BOOL, PCWSTR},
    Win32::{
        Foundation::{HWND, RECT},
        System::Console::SetConsoleCtrlHandler,
        UI::WindowsAndMessaging::{
            FindWindowW, SetWindowPos, ShowWindow, SystemParametersInfoW,
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

pub fn pin_window_to_bottom(
    hwnd: HWND,
    monitor_x: i32,
    monitor_y: i32,
    monitor_w: i32,
    monitor_h: i32,
    bar_height_physical: i32,
) {
    let target_y = monitor_y + monitor_h - bar_height_physical;
    unsafe {
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            monitor_x,
            target_y,
            monitor_w,
            bar_height_physical,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
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
    BOOL(0) // Return FALSE (0) so the process continues normal shutdown
}

pub fn install_fail_safe() {
    unsafe {
        let _ = SetConsoleCtrlHandler(Some(console_ctrl_handler), true);
    }
}
