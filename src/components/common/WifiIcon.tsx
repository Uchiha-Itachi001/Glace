import React from "react";
import { NetworkState } from "../../hooks/useNetworkStatus";

interface WifiIconProps {
  state: NetworkState;
  size?: number;
  className?: string;
}

export const WifiIcon: React.FC<WifiIconProps> = ({
  state,
  size = 15,
  className = "",
}) => {
  if (state === "connecting") {
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
        className={`wifi-icon wifi-icon--connecting ${className}`}
      >
        <path d="M1.42 9a16 16 0 0 1 21.16 0" className="wifi-wave wifi-wave--3" />
        <path d="M5 12.55a11 11 0 0 1 14.08 0" className="wifi-wave wifi-wave--2" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" className="wifi-wave wifi-wave--1" />
        <circle cx="12" cy="20" r="1.5" fill="#38bdf8" stroke="none" className="wifi-wave wifi-wave--0" />
      </svg>
    );
  }

  if (state === "disconnected") {
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
        className={`wifi-icon wifi-icon--disconnected ${className}`}
      >
        {/* Dimmed Clean Wi-Fi Arcs */}
        <path d="M1.42 9a16 16 0 0 1 21.16 0" opacity="0.3" />
        <path d="M5 12.55a11 11 0 0 1 14.08 0" opacity="0.4" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" opacity="0.5" />
        <circle cx="12" cy="20" r="1.5" fill="currentColor" opacity="0.5" stroke="none" />
        {/* Clean Small Bottom-Right 'x' Mark */}
        <path d="M16.5 16.5l5 5M21.5 16.5l-5 5" stroke="#f87171" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  // Connected State (Default)
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
      className={`wifi-icon wifi-icon--connected ${className}`}
    >
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
};
