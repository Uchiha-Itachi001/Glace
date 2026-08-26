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

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::taskbar::hide_native_taskbar,
            commands::taskbar::restore_native_taskbar,
            commands::taskbar::open_start_menu,
            commands::taskbar::launch_app,
            commands::taskbar::power_action,
            commands::windows::get_open_windows,
            commands::windows::focus_window,
            commands::windows::minimize_window,
            commands::windows::close_window,
            commands::windows::snap_window,
            commands::windows::set_window_height,
            commands::tray::get_tray_icons,
            commands::tray::get_system_metrics,
            commands::settings::get_settings,
            commands::settings::save_settings,
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
            if let tauri::WindowEvent::Destroyed = event {
                work_area::restore_native_taskbar();
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    let size = monitor.size();
                    work_area::restore(size.height as i32, size.width as i32);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Glace");
}
