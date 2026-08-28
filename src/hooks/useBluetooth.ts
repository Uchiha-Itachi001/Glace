import { useState, useEffect } from "react";
import { BluetoothDevice } from "../types";
import { tauriBridge } from "../services/tauriBridge";
import { useSettings } from "../stores/settingsStore";

export const useBluetooth = () => {
  const { settings } = useSettings();
  const isEnabled = Boolean(settings.enable_dynamic_island && settings.island_show_bluetooth);

  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [activeDevice, setActiveDevice] = useState<BluetoothDevice | null>(null);

  useEffect(() => {
    // If disabled in settings, do not poll or invoke IPC
    if (!isEnabled) {
      setDevices([]);
      setActiveDevice(null);
      return;
    }

    let isMounted = true;

    const fetchBluetooth = async () => {
      try {
        const list = await tauriBridge.getBluetoothDevices();
        if (isMounted) {
          if (list && list.length > 0) {
            setDevices(list);
            const connected = list.find((d) => d.connected) || null;
            setActiveDevice(connected);
          } else {
            setDevices([]);
            setActiveDevice(null);
          }
        }
      } catch (err) {
        console.error("Error fetching bluetooth devices:", err);
        if (isMounted) {
          setDevices([]);
          setActiveDevice(null);
        }
      }
    };

    fetchBluetooth();
    const interval = setInterval(fetchBluetooth, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isEnabled]);

  return {
    devices,
    activeDevice,
    isConnected: isEnabled && Boolean(activeDevice?.connected),
  };
};
