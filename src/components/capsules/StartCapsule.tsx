import React from "react";
import { tauriBridge } from "../../services/tauriBridge";
import { useFlyout } from "../../stores/flyoutStore";

export const StartCapsule: React.FC = () => {
  const { activeFlyout, toggleFlyout } = useFlyout();
  const isStartOpen = activeFlyout === "start";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFlyout("start", 650);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    tauriBridge.openStartMenu().catch(console.error);
  };

  return (
    <div
      className={`capsule capsule--compact start-capsule icon-hover ${
        isStartOpen ? "start-capsule--active" : ""
      }`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title="Left-click: Glace Launcher | Right-click: Windows Start"
    >
      <div className="start-icon-wrapper">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="start-svg-glyph"
        >
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      </div>
    </div>
  );
};
