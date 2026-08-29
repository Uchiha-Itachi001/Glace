use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use windows::core::{BOOL, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::System::ProcessStatus::K32GetModuleFileNameExW;
use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
use windows::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, FindWindowW, GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowTextW,
    GetWindowThreadProcessId, IsWindow, IsWindowVisible,
    EVENT_OBJECT_CLOAKED, EVENT_OBJECT_CREATE, EVENT_OBJECT_DESTROY,
    EVENT_OBJECT_UNCLOAKED, EVENT_SYSTEM_FOREGROUND,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FlyoutKind {
    StartMenu,
    QuickSettings,
    CalendarNotifications,
    Widgets,
    TrayOverflow,
}

#[derive(Debug, Clone)]
struct FlyoutState {
    is_open: bool,
    last_uncloaked_or_foreground: Option<Instant>,
    last_dismissed: Option<Instant>,
}

static FLYOUT_STATES: Mutex<Option<HashMap<FlyoutKind, FlyoutState>>> = Mutex::new(None);

pub fn is_window_active_flyout(hwnd: HWND) -> bool {
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() || !IsWindowVisible(hwnd).as_bool() {
            return false;
        }

        let mut cloaked: u32 = 0;
        let hr = DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut _ as *mut std::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        );
        if hr.is_ok() && cloaked != 0 {
            return false;
        }

        let mut rc = RECT::default();
        let _ = GetWindowRect(hwnd, &mut rc);
        if rc.right <= rc.left || rc.bottom <= rc.top {
            return false;
        }

        true
    }
}

pub fn classify_hwnd(hwnd: HWND) -> Option<FlyoutKind> {
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() {
            return None;
        }

        let mut class_buf = [0u16; 256];
        let class_len = GetClassNameW(hwnd, &mut class_buf);
        let class_name = if class_len > 0 {
            String::from_utf16_lossy(&class_buf[..class_len as usize])
        } else {
            String::new()
        };

        let mut title_buf = [0u16; 256];
        let title_len = GetWindowTextW(hwnd, &mut title_buf);
        let title = if title_len > 0 {
            String::from_utf16_lossy(&title_buf[..title_len as usize]).to_lowercase()
        } else {
            String::new()
        };

        // 1. Direct class name matches
        if class_name == "ControlCenterWindow" || class_name == "ActionCenter" {
            return Some(FlyoutKind::QuickSettings);
        }
        if class_name == "NotificationCenterWindow" {
            return Some(FlyoutKind::CalendarNotifications);
        }
        if class_name == "DashboardFrame"
            || class_name == "WindowsDashboardHost"
            || class_name.contains("Dashboard")
        {
            return Some(FlyoutKind::Widgets);
        }
        if class_name == "TopLevelWindowForOverflowXamlIsland" || class_name == "NotifyIconOverflowWindow" {
            return Some(FlyoutKind::TrayOverflow);
        }
        if class_name == "XamlExplorerHostIslandWindow"
            || class_name == "Windows.UI.Core.AppFrameWindow"
            || class_name == "Shell_LightDismissOverlayWindow"
        {
            return Some(FlyoutKind::StartMenu);
        }

        // 2. Direct title keyword matches
        if title.contains("widget") || title.contains("dashboard") {
            return Some(FlyoutKind::Widgets);
        }
        if title == "quick settings" || title == "control center" {
            return Some(FlyoutKind::QuickSettings);
        }
        if title == "notification center" || title == "calendar" {
            return Some(FlyoutKind::CalendarNotifications);
        }
        if title == "start" && (class_name.contains("CoreWindow") || class_name.contains("Island")) {
            return Some(FlyoutKind::StartMenu);
        }

        // 3. Process inspection for generic host classes (Windows.UI.Core.CoreWindow, ApplicationFrameWindow, etc.)
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid != 0 {
            if let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                if !process.0.is_null() {
                    let mut path_buf = [0u16; 512];
                    let len = K32GetModuleFileNameExW(Some(process), None, &mut path_buf);
                    let _ = windows::Win32::Foundation::CloseHandle(process);
                    if len > 0 {
                        let exe = String::from_utf16_lossy(&path_buf[..len as usize]).to_lowercase();
                        if exe.contains("widgets")
                            || exe.contains("widgetservice")
                            || exe.contains("dashboardhost")
                            || exe.contains("webexperiencehost")
                        {
                            return Some(FlyoutKind::Widgets);
                        }
                        if exe.contains("startmenuexperiencehost") || exe.contains("searchhost") {
                            return Some(FlyoutKind::StartMenu);
                        }
                        if exe.contains("shellexperiencehost") {
                            if title.contains("quick") || title.contains("control") {
                                return Some(FlyoutKind::QuickSettings);
                            }
                            if title.contains("notification") || title.contains("calendar") {
                                return Some(FlyoutKind::CalendarNotifications);
                            }
                            return Some(FlyoutKind::StartMenu);
                        }
                    }
                }
            }
        }

        None
    }
}

pub fn is_flyout_currently_open(kind: FlyoutKind) -> bool {
    unsafe {
        // 1. Check current foreground window
        let fg = GetForegroundWindow();
        if !fg.0.is_null() && is_window_active_flyout(fg) {
            if classify_hwnd(fg) == Some(kind) {
                return true;
            }
        }

        // 2. Direct FindWindowW for known unique class names
        let class_names = match kind {
            FlyoutKind::StartMenu => vec![
                "XamlExplorerHostIslandWindow",
                "Windows.UI.Core.AppFrameWindow",
                "Shell_LightDismissOverlayWindow",
            ],
            FlyoutKind::QuickSettings => vec!["ControlCenterWindow", "ActionCenter"],
            FlyoutKind::CalendarNotifications => vec!["NotificationCenterWindow"],
            FlyoutKind::Widgets => vec!["DashboardFrame", "WindowsDashboardHost"],
            FlyoutKind::TrayOverflow => vec![
                "TopLevelWindowForOverflowXamlIsland",
                "NotifyIconOverflowWindow",
            ],
        };

        for class_name in class_names {
            let wide: Vec<u16> = class_name.encode_utf16().chain(std::iter::once(0)).collect();
            if let Ok(h) = FindWindowW(PCWSTR(wide.as_ptr()), PCWSTR::null()) {
                if !h.0.is_null() && is_window_active_flyout(h) {
                    return true;
                }
            }
        }

        // 3. Fast EnumWindows fallback to catch host windows (e.g. Widgets XAML/WebView2 hosts)
        struct EnumState {
            target: FlyoutKind,
            found: bool,
        }

        unsafe extern "system" fn enum_flyout_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let state = &mut *(lparam.0 as *mut EnumState);
            if is_window_active_flyout(hwnd) {
                if classify_hwnd(hwnd) == Some(state.target) {
                    state.found = true;
                    return BOOL(0); // Stop enum immediately
                }
            }
            BOOL(1)
        }

        let mut state = EnumState {
            target: kind,
            found: false,
        };

        let _ = EnumWindows(
            Some(enum_flyout_proc),
            LPARAM(&mut state as *mut _ as isize),
        );

        state.found
    }
}

pub fn on_win_event(event: u32, hwnd: HWND) {
    if let Some(kind) = classify_hwnd(hwnd) {
        let now = Instant::now();
        if let Ok(mut guard) = FLYOUT_STATES.lock() {
            let map = guard.get_or_insert_with(HashMap::new);
            let state = map.entry(kind).or_insert(FlyoutState {
                is_open: false,
                last_uncloaked_or_foreground: None,
                last_dismissed: None,
            });

            match event {
                EVENT_SYSTEM_FOREGROUND | EVENT_OBJECT_UNCLOAKED | EVENT_OBJECT_CREATE => {
                    if is_window_active_flyout(hwnd) {
                        state.is_open = true;
                        state.last_uncloaked_or_foreground = Some(now);
                    }
                }
                EVENT_OBJECT_CLOAKED | EVENT_OBJECT_DESTROY => {
                    state.is_open = false;
                    state.last_dismissed = Some(now);
                }
                _ => {}
            }
        }
    } else if event == EVENT_SYSTEM_FOREGROUND {
        let now = Instant::now();
        if let Ok(mut guard) = FLYOUT_STATES.lock() {
            if let Some(map) = guard.as_mut() {
                for (_kind, state) in map.iter_mut() {
                    if state.is_open {
                        state.is_open = false;
                        state.last_dismissed = Some(now);
                    }
                }
            }
        }
    }
}

pub fn toggle_flyout<F>(kind: FlyoutKind, send_hotkey: F)
where
    F: FnOnce(),
{
    let now = Instant::now();
    let cooldown = Duration::from_millis(450);

    let is_open_now = is_flyout_currently_open(kind);
    let was_recently_active = if let Ok(guard) = FLYOUT_STATES.lock() {
        if let Some(map) = guard.as_ref() {
            if let Some(state) = map.get(&kind) {
                let active_recent = state
                    .last_uncloaked_or_foreground
                    .map(|t| now.duration_since(t) < cooldown)
                    .unwrap_or(false);
                let dismiss_recent = state
                    .last_dismissed
                    .map(|t| now.duration_since(t) < cooldown)
                    .unwrap_or(false);
                state.is_open || active_recent || dismiss_recent
            } else {
                false
            }
        } else {
            false
        }
    } else {
        false
    };

    if is_open_now || was_recently_active {
        // Flyout was already open / uncloaked and was just dismissed by this click.
        // Suppress sending the hotkey so it stays closed!
        if let Ok(mut guard) = FLYOUT_STATES.lock() {
            let map = guard.get_or_insert_with(HashMap::new);
            let state = map.entry(kind).or_insert(FlyoutState {
                is_open: false,
                last_uncloaked_or_foreground: None,
                last_dismissed: None,
            });
            state.is_open = false;
            state.last_dismissed = Some(now);
            state.last_uncloaked_or_foreground = None;
        }
    } else {
        // Flyout is closed, user wants to open it
        if let Ok(mut guard) = FLYOUT_STATES.lock() {
            let map = guard.get_or_insert_with(HashMap::new);
            let state = map.entry(kind).or_insert(FlyoutState {
                is_open: false,
                last_uncloaked_or_foreground: None,
                last_dismissed: None,
            });
            state.is_open = true;
            state.last_uncloaked_or_foreground = Some(now);
            state.last_dismissed = None;
        }
        send_hotkey();
    }
}

pub fn toggle_start_menu() {
    toggle_flyout(FlyoutKind::StartMenu, || unsafe {
        keybd_event(0x5B, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x5B, 0, KEYEVENTF_KEYUP, 0);
    });
}

pub fn toggle_quick_settings() {
    toggle_flyout(FlyoutKind::QuickSettings, || unsafe {
        keybd_event(0x5B, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x41 /* 'A' */, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x41, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(0x5B, 0, KEYEVENTF_KEYUP, 0);
    });
}

pub fn toggle_calendar_notifications() {
    toggle_flyout(FlyoutKind::CalendarNotifications, || unsafe {
        keybd_event(0x5B, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x4E /* 'N' */, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x4E, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(0x5B, 0, KEYEVENTF_KEYUP, 0);
    });
}

pub fn toggle_widgets_panel() {
    toggle_flyout(FlyoutKind::Widgets, || unsafe {
        keybd_event(0x5B, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x57 /* 'W' */, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x57, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(0x5B, 0, KEYEVENTF_KEYUP, 0);
    });
}

pub fn toggle_tray_overflow() {
    toggle_flyout(FlyoutKind::TrayOverflow, || unsafe {
        keybd_event(0x5B, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x42 /* 'B' */, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x42, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(0x5B, 0, KEYEVENTF_KEYUP, 0);

        std::thread::sleep(std::time::Duration::from_millis(50));
        keybd_event(0x0D /* VK_RETURN */, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x0D, 0, KEYEVENTF_KEYUP, 0);
    });
}
