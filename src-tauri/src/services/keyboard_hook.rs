use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::{LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    VK_CONTROL, VK_LCONTROL, VK_LSHIFT, VK_RCONTROL, VK_RSHIFT, VK_SHIFT, VK_SPACE, VK_TAB,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetCursorPos, GetMessageW, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN,
    WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

#[derive(Clone, Serialize)]
pub struct ShiftStatePayload {
    pub is_down: bool,
    pub in_notch: bool,
}

static APP_HANDLE: Mutex<Option<AppHandle>> = Mutex::new(None);
static LAST_SHIFT_DOWN: AtomicBool = AtomicBool::new(false);

unsafe extern "system" fn ll_keyboard_proc(ncode: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if ncode >= 0 {
        let msg = wparam.0 as u32;
        if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN || msg == WM_KEYUP || msg == WM_SYSKEYUP {
            let kbd = *(lparam.0 as *const KBDLLHOOKSTRUCT);
            let vk = kbd.vkCode;

            let settings = crate::config::settings::load();
            let is_macos_mode = settings.bar_position == "macos" || settings.bar_position == "top";

            let target_key = settings.notch_peek_key.to_lowercase();
            let is_matched_key = match target_key.as_str() {
                "ctrl" | "control" => {
                    vk == VK_LCONTROL.0 as u32 || vk == VK_RCONTROL.0 as u32 || vk == VK_CONTROL.0 as u32
                }
                "space" => vk == VK_SPACE.0 as u32,
                "tab" => vk == VK_TAB.0 as u32,
                _ => {
                    vk == VK_LSHIFT.0 as u32 || vk == VK_RSHIFT.0 as u32 || vk == VK_SHIFT.0 as u32
                }
            };

            if is_matched_key {
                let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
                let prev = LAST_SHIFT_DOWN.swap(is_down, Ordering::Relaxed);
                if prev != is_down {
                    if is_down {
                        if !is_macos_mode && settings.enable_dynamic_island {
                            let mut pt = POINT::default();
                            let _ = GetCursorPos(&mut pt);

                            let in_notch = if let Some(config) = crate::services::work_area::get_glace_config() {
                                let notch_w = 240;
                                let notch_left = config.monitor_x + ((config.monitor_w - notch_w) / 2);
                                let notch_right = notch_left + notch_w;
                                pt.x >= notch_left && pt.x <= notch_right && pt.y >= config.monitor_y && pt.y <= config.monitor_y + 42
                            } else {
                                pt.y >= 0 && pt.y <= 42
                            };

                            if in_notch {
                                crate::services::work_area::set_notch_peek_through(true);
                            }

                            if let Ok(guard) = APP_HANDLE.lock() {
                                if let Some(app) = guard.as_ref() {
                                    let _ = app.emit("notch-shift-state", ShiftStatePayload { is_down: true, in_notch });
                                }
                            }
                        }
                    } else {
                        // Key released: ALWAYS immediately restore Win32 hardware window region and inform UI
                        crate::services::work_area::set_notch_peek_through(false);
                        if let Ok(guard) = APP_HANDLE.lock() {
                            if let Some(app) = guard.as_ref() {
                                let _ = app.emit("notch-shift-state", ShiftStatePayload { is_down: false, in_notch: false });
                            }
                        }
                    }
                }
            }
        }
    }
    CallNextHookEx(None, ncode, wparam, lparam)
}

pub fn start(app: AppHandle) {
    if let Ok(mut guard) = APP_HANDLE.lock() {
        *guard = Some(app);
    }

    std::thread::spawn(|| unsafe {
        let hook = SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(ll_keyboard_proc),
            None,
            0,
        );

        if let Ok(h) = hook {
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            let _ = UnhookWindowsHookEx(h);
        }
    });
}
