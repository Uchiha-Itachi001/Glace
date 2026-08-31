import React from "react";
import { NetworkState } from "../../hooks/useNetworkStatus";

export type NetworkType = "ethernet" | "wifi" | "disconnected" | "unknown";

interface NetworkIconProps {
  netType?: NetworkType;
  state?: NetworkState;
  size?: number;
  className?: string;
}

export const NetworkIcon: React.FC<NetworkIconProps> = ({
  netType = "wifi",
  state = "connected",
  size = 15,
  className = "",
}) => {
  const isConnecting = state === "connecting";
  const isDisconnected = state === "disconnected" || netType === "disconnected";
  const isEthernet = netType === "ethernet";

  // 1. ETHERNET ICON (Windows 11 Fluent Monitor + Cable Plug)
  if (isEthernet) {
    if (isConnecting) {
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`network-icon network-icon--ethernet network-icon--connecting ${className}`}
        >
          <rect x="2" y="3" width="13" height="11" rx="2" />
          <path d="M5 18h7M8.5 14v4" />
          <path d="M19 3v4" />
          <rect x="17" y="7" width="4" height="6" rx="1" />
          <path d="M19 13v8" />
        </svg>
      );
    }

    if (isDisconnected) {
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`network-icon network-icon--ethernet network-icon--disconnected ${className}`}
        >
          <rect x="2" y="3" width="13" height="11" rx="2" opacity="0.45" />
          <path d="M5 18h7M8.5 14v4" opacity="0.45" />
          <path d="M19 3v4" opacity="0.45" />
          <rect x="17" y="7" width="4" height="6" rx="1" opacity="0.45" />
          <path d="M19 13v8" opacity="0.45" />
          <path d="M16 16l5 5M21 16l-5 5" stroke="#f87171" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    }

    // Ethernet Connected
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`network-icon network-icon--ethernet ${className}`}
      >
        <rect x="2" y="3" width="13" height="11" rx="2" />
        <path d="M5 18h7M8.5 14v4" />
        <path d="M19 3v4" />
        <rect x="17" y="7" width="4" height="6" rx="1" />
        <path d="M19 13v8" />
      </svg>
    );
  }

  // 2. WI-FI ICON (Windows 11 Fluent Arcs)
  if (isConnecting) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`network-icon wifi-icon wifi-icon--connecting ${className}`}
      >
        <path d="M1.42 9a16 16 0 0 1 21.16 0" className="wifi-wave wifi-wave--3" />
        <path d="M5 12.55a11 11 0 0 1 14.08 0" className="wifi-wave wifi-wave--2" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" className="wifi-wave wifi-wave--1" />
        <circle cx="12" cy="20" r="1.5" fill="#38bdf8" stroke="none" className="wifi-wave wifi-wave--0" />
      </svg>
    );
  }

  if (isDisconnected) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`network-icon wifi-icon wifi-icon--disconnected ${className}`}
      >
        <path d="M1.42 9a16 16 0 0 1 21.16 0" opacity="0.3" />
        <path d="M5 12.55a11 11 0 0 1 14.08 0" opacity="0.4" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" opacity="0.5" />
        <circle cx="12" cy="20" r="1.5" fill="currentColor" opacity="0.5" stroke="none" />
        <path d="M16.5 16.5l5 5M21.5 16.5l-5 5" stroke="#f87171" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  // Wi-Fi Connected (Default)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`network-icon wifi-icon wifi-icon--connected ${className}`}
    >
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
};
