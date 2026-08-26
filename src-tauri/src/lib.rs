mod commands;
mod config;
mod models;
mod services;

use services::work_area;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Install console Ctrl+C / break / exit handler
    work_area::install_fail_safe();

    // Fail-safe: always restore native taskbar on panic before the process dies
    std::panic::set_hook(Box::new(|info| {
        eprintln!("[glace] panic: {info}");
        work_area::restore_native_taskbar();
        work_area::restore(1080, 1920);
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
            commands::taskbar::toggle_input_language,
            commands::taskbar::open_touch_keyboard,
            commands::taskbar::open_widgets_panel,
            commands::taskbar::launch_app,
            commands::taskbar::power_action,
            commands::windows::get_open_windows,
            commands::windows::focus_window,
            commands::windows::minimize_window,
            commands::windows::close_window,
            commands::windows::snap_window,
            commands::windows::set_window_height,
            commands::windows::get_window_thumbnail,
            commands::tray::get_tray_icons,
            commands::tray::get_system_metrics,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::pinned::get_pinned_apps,
            commands::pinned::pin_app,
            commands::pinned::unpin_app,
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            if let Ok(Some(monitor)) = window.primary_monitor() {
                let size = monitor.size();
                let pos = monitor.position();
                let scale_factor = monitor.scale_factor();
                let bar_height_logical = 48.0;
                let bar_height_physical = (bar_height_logical * scale_factor).round() as i32;

                if let Ok(hwnd) = window.hwnd() {
                    let win32_hwnd = windows::Win32::Foundation::HWND(hwnd.0 as _);

                    // Strip all title-bar / caption / border styles and set WS_POPUP
                    unsafe {
                        use windows::Win32::UI::WindowsAndMessaging::{
                            GetWindowLongW, SetWindowLongW, SetWindowPos, GWL_STYLE, GWL_EXSTYLE,
                            WS_CAPTION, WS_SYSMENU, WS_BORDER, WS_THICKFRAME, WS_MINIMIZEBOX,
                            WS_MAXIMIZEBOX, WS_POPUP, WS_VISIBLE, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
                            SWP_FRAMECHANGED, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SWP_NOACTIVATE,
                        };
                        let style = GetWindowLongW(win32_hwnd, GWL_STYLE) as u32;
                        let clean = (style & !(WS_CAPTION.0 | WS_SYSMENU.0 | WS_BORDER.0 | WS_THICKFRAME.0 | WS_MINIMIZEBOX.0 | WS_MAXIMIZEBOX.0)) | WS_POPUP.0 | WS_VISIBLE.0;
                        SetWindowLongW(win32_hwnd, GWL_STYLE, clean as i32);

                        let ex_style = GetWindowLongW(win32_hwnd, GWL_EXSTYLE) as u32;
                        let clean_ex = (ex_style & !WS_EX_APPWINDOW.0) | WS_EX_TOOLWINDOW.0;
                        SetWindowLongW(win32_hwnd, GWL_EXSTYLE, clean_ex as i32);

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

                    work_area::pin_window_to_bottom(
                        win32_hwnd,
                        pos.x,
                        pos.y,
                        size.width as i32,
                        size.height as i32,
                        bar_height_physical,
                    );
                }
            }

            services::window_watcher::start(app.handle().clone());

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
            work_area::restore(1080, 1920);
        }
    });
}
