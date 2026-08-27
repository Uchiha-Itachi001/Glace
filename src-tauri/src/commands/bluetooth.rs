use crate::models::types::BluetoothDevice;
use crate::services::bluetooth;

#[tauri::command]
pub fn get_bluetooth_devices() -> Vec<BluetoothDevice> {
    bluetooth::get_connected_devices()
}
