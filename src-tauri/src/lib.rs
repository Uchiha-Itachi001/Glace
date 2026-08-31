mod commands;
mod config;
mod models;
mod services;

use services::work_area;
use tauri::Manager;

unsafe extern "system" fn taskbar_subclass_proc(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
    _uidsubclass: usize,
    _refdata: usize,
) -> windows::Win32::Foundation::LRESULT {
    match msg {
        // Prevent Windows DWM from painting non-client caption bar on window focus/activation
        windows::Win32::UI::WindowsAndMessaging::WM_NCACTIVATE => {
            windows::Win32::Foundation::LRESULT(1)
        }
        windows::Win32::UI::WindowsAndMessaging::WM_NCPAINT => {
            windows::Win32::Foundation::LRESULT(0)
        }
        windows::Win32::UI::WindowsAndMessaging::WM_SETTEXT => {
            windows::Win32::Foundation::LRESULT(1)
        }
        _ => windows::Win32::UI::Shell::DefSubclassProc(hwnd, msg, wparam, lparam),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Install console Ctrl+C / break / exit handler
    work_area::install_fail_safe();

    // Fail-safe: always restore native taskbar on panic before the process dies
    std::panic::set_hook(Box::new(|info| {
        eprintln!("[glace] panic: {info}");
        work_area::restore_native_taskbar();
        work_area::restore(0, 0);
    }));

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::taskbar::hide_native_taskbar,
            commands::taskbar::restore_native_taskbar,
            commands::taskbar::open_start_menu,
            commands::taskbar::open_quick_settings,
            commands::taskbar::open_calendar_notifications,
            commands::taskbar::open_windows_settings,
            commands::taskbar::open_tray_overflow,
            commands::taskbar::is_tray_overflow_open,
            commands::taskbar::toggle_input_language,
            commands::taskbar::get_current_keyboard_layout,
            commands::taskbar::open_touch_keyboard,
            commands::taskbar::open_widgets_panel,
            commands::taskbar::launch_app,
            commands::taskbar::power_action,
            commands::taskbar::update_work_area,
            commands::windows::get_open_windows,
            commands::windows::focus_window,
            commands::windows::minimize_window,
            commands::windows::close_window,
            commands::windows::terminate_window_process,
            commands::windows::snap_window,
            commands::windows::set_window_height,
            commands::windows::get_window_thumbnail,
            commands::tray::get_tray_icons,
            commands::tray::get_system_metrics,
            commands::tray::get_app_resource_usage,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::pinned::get_pinned_apps,
            commands::pinned::pin_app,
            commands::pinned::unpin_app,
            commands::media::media_toggle_play_pause,
            commands::media::media_next_track,
            commands::media::media_prev_track,
            commands::media::media_volume_up,
            commands::media::media_volume_down,
            commands::media::media_volume_mute,
            commands::media::media_seek,
            commands::media::media_focus_app,
            commands::media::get_media_session_info,
            commands::bluetooth::get_bluetooth_devices,
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            if let Ok(Some(monitor)) = window.primary_monitor() {
                let size = monitor.size();
                let pos = monitor.position();
                let scale_factor = monitor.scale_factor();

                if let Ok(hwnd) = window.hwnd() {
                    let win32_hwnd = windows::Win32::Foundation::HWND(hwnd.0 as _);

                    // Strip all title-bar / caption / border styles and set WS_POPUP
                    unsafe {
                        use windows::Win32::UI::WindowsAndMessaging::{
                            GetWindowLongW, SetWindowLongW, SetWindowPos, SetWindowTextW, GWL_STYLE, GWL_EXSTYLE,
                            WS_CAPTION, WS_SYSMENU, WS_BORDER, WS_THICKFRAME, WS_MINIMIZEBOX,
                            WS_MAXIMIZEBOX, WS_POPUP, WS_VISIBLE, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
                            SWP_FRAMECHANGED, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SWP_NOACTIVATE,
                        };
                        use windows::Win32::Graphics::Dwm::{
                            DwmExtendFrameIntoClientArea, DwmSetWindowAttribute, DWMWA_NCRENDERING_POLICY, DWMNCRP_DISABLED,
                            DWMWA_TRANSITIONS_FORCEDISABLED,
                        };
                        use windows::Win32::UI::Controls::MARGINS;
                        use windows::Win32::UI::Shell::SetWindowSubclass;

                        let style = GetWindowLongW(win32_hwnd, GWL_STYLE) as u32;
                        let clean = (style & !(WS_CAPTION.0 | WS_SYSMENU.0 | WS_BORDER.0 | WS_THICKFRAME.0 | WS_MINIMIZEBOX.0 | WS_MAXIMIZEBOX.0)) | WS_POPUP.0 | WS_VISIBLE.0;
                        SetWindowLongW(win32_hwnd, GWL_STYLE, clean as i32);

                        let ex_style = GetWindowLongW(win32_hwnd, GWL_EXSTYLE) as u32;
                        let clean_ex = (ex_style & !WS_EX_APPWINDOW.0) | WS_EX_TOOLWINDOW.0;
                        SetWindowLongW(win32_hwnd, GWL_EXSTYLE, clean_ex as i32);

                        // Disable DWM non-client caption bar rendering
                        let policy = DWMNCRP_DISABLED.0 as u32;
                        let _ = DwmSetWindowAttribute(
                            win32_hwnd,
                            DWMWA_NCRENDERING_POLICY,
                            &policy as *const _ as *const _,
                            std::mem::size_of::<u32>() as u32,
                        );

                        let disable_trans: u32 = 1;
                        let _ = DwmSetWindowAttribute(
                            win32_hwnd,
                            DWMWA_TRANSITIONS_FORCEDISABLED,
                            &disable_trans as *const _ as *const _,
                            std::mem::size_of::<u32>() as u32,
                        );

                        // Extend glass frame across entire window (-1 margins = 100% transparent glass)
                        let margins = MARGINS {
                            cxLeftWidth: -1,
                            cxRightWidth: -1,
                            cyTopHeight: -1,
                            cyBottomHeight: -1,
                        };
                        let _ = DwmExtendFrameIntoClientArea(win32_hwnd, &margins);

                        // Set empty window title in Win32
                        let empty_title: Vec<u16> = vec![0];
                        let _ = SetWindowTextW(win32_hwnd, windows::core::PCWSTR(empty_title.as_ptr()));

                        // Subclass window to intercept and permanently drop WM_NCACTIVATE and WM_NCPAINT
                        let _ = SetWindowSubclass(
                            win32_hwnd,
                            Some(taskbar_subclass_proc),
                            101,
                            0,
                        );

                        let _ = SetWindowPos(
                            win32_hwnd,
                            None,
                            0,
                            0,
                            0,
                            0,
                            SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
                        );
                    }

                    let initial_settings = config::settings::load();
                    let top_notch_physical = if initial_settings.enable_dynamic_island {
                        (initial_settings.margin_top as f64 * scale_factor).round() as i32
                    } else {
                        0
                    };
                    let bar_bottom_physical = (initial_settings.margin_bottom as f64 * scale_factor).round() as i32;
                    let left_margin_physical = (initial_settings.margin_left as f64 * scale_factor).round() as i32;
                    let right_margin_physical = (initial_settings.margin_right as f64 * scale_factor).round() as i32;

                    work_area::pin_window_to_bottom(
                        win32_hwnd,
                        pos.x,
                        pos.y,
                        size.width as i32,
                        size.height as i32,
                        bar_bottom_physical,
                        top_notch_physical,
                        left_margin_physical,
                        right_margin_physical,
                    );
                }
            }

            let initial_settings = config::settings::load();
            services::autostart::sync_autostart(initial_settings.autostart);
            services::bluetooth::set_enabled(initial_settings.enable_dynamic_island && initial_settings.island_show_bluetooth);
            services::window_watcher::start(app.handle().clone());
            services::pinned_apps::start_watcher(app.handle().clone());
            services::bluetooth::start();

            // Background working set trimmer: flushes unused heap pages every 45s to minimize RAM footprint
            std::thread::spawn(|| {
                use windows::Win32::System::Threading::GetCurrentProcess;
                use windows::Win32::System::ProcessStatus::EmptyWorkingSet;
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(45));
                    unsafe {
                        let _ = EmptyWorkingSet(GetCurrentProcess());
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(
                event,
                tauri::WindowEvent::Destroyed | tauri::WindowEvent::CloseRequested { .. }
            ) {
                work_area::restore_native_taskbar();
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    let size = monitor.size();
                    work_area::restore(size.height as i32, size.width as i32);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Glace");

    app.run(|_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
            work_area::restore_native_taskbar();
            work_area::restore(0, 0);
        }
    });
}
