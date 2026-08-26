import React, { useState, useEffect } from "react";
import { useFlyout } from "../../stores/flyoutStore";

export const ClockCapsule: React.FC = () => {
  const [time, setTime] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const { activeFlyout, toggleFlyout } = useFlyout();
  const isCalendarOpen = activeFlyout === "calendar";

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
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={`capsule capsule--compact clock-capsule icon-hover ${
        isCalendarOpen ? "clock-capsule--active" : ""
      }`}
      onClick={(e) => {
        e.stopPropagation();
        toggleFlyout("calendar", 450);
      }}
      title="Click to view Calendar"
    >
      <div className="clock-content">
        <span className="clock-time">{time}</span>
        <span className="clock-date">{date}</span>
      </div>
    </div>
  );
};
