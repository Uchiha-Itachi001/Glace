import React from "react";
import { tauriBridge } from "../../services/tauriBridge";

export const StartCapsule: React.FC = () => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Directly opens the native Windows Start Menu
    tauriBridge.openStartMenu().catch(console.error);
  };

  return (
    <div
      className="capsule capsule--compact start-capsule icon-hover"
      onClick={handleClick}
      title="Start"
    >
      <div className="start-icon-wrapper">
        {/* Official Windows 11 4-Tile Fluent Logo */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          className="start-windows-glyph"
        >
          <rect x="2.5" y="2.5" width="8.8" height="8.8" rx="1.2" fill="#00a4ef" />
          <rect x="12.7" y="2.5" width="8.8" height="8.8" rx="1.2" fill="#00a4ef" />
          <rect x="2.5" y="12.7" width="8.8" height="8.8" rx="1.2" fill="#00a4ef" />
          <rect x="12.7" y="12.7" width="8.8" height="8.8" rx="1.2" fill="#00a4ef" />
        </svg>
      </div>
    </div>
  );
};
