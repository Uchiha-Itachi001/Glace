import React, { useState, useEffect } from "react";
import { tauriBridge } from "../../services/tauriBridge";

export const ClockCapsule: React.FC = () => {
  const [time, setTime] = useState<string>("");
  const [date, setDate] = useState<string>("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      );
      setDate(
        now.toLocaleDateString([], {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      );
    };

    update();
    const interval = setInterval(update, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Directly opens the native Windows Notification Center & Calendar Flyout (Win + N)
    tauriBridge.openCalendarNotifications().catch(console.error);
  };

  return (
    <div
      className="capsule capsule--compact clock-capsule"
      onClick={handleClick}
      title="Notification Center & Calendar (Win + N)"
    >
      <div className="clock-content">
        <span className="clock-time">{time}</span>
        <span className="clock-date">{date}</span>
      </div>
    </div>
  );
};
