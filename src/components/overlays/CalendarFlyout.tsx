import React, { useState } from "react";
import { useSettings } from "../../stores/settingsStore";

interface CalendarFlyoutProps {
  onClose: () => void;
}

export const CalendarFlyout: React.FC<CalendarFlyoutProps> = ({ onClose }) => {
  const { settings } = useSettings();
  const [currentDate] = useState(new Date());

  const barAlign = settings?.bar_alignment || "center";
  const barPos = settings?.bar_position || "bottom";

  const year = currentDate.getFullYear();
  const monthName = currentDate.toLocaleString("default", { month: "long" });
  const dayName = currentDate.toLocaleString("default", { weekday: "long" });
  const dayNum = currentDate.getDate();

  const daysInMonth = new Date(year, currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, currentDate.getMonth(), 1).getDay();

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blankDays = Array.from({ length: firstDayOfWeek }, (_, i) => i);

  return (
    <div
      className={`calendar-flyout calendar-flyout--align-${barAlign} calendar-flyout--pos-${barPos} flyout-enter`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="calendar-header">
        <div className="calendar-date-hero">
          <span className="calendar-hero-day">{dayName}</span>
          <span className="calendar-hero-full">
            {monthName} {dayNum}, {year}
          </span>
        </div>
        <button className="calendar-close-btn icon-hover" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="calendar-divider" />

      <div className="calendar-grid-header">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <span key={d} className="calendar-weekday-label">
            {d}
          </span>
        ))}
      </div>

      <div className="calendar-days-grid">
        {blankDays.map((_, idx) => (
          <div key={`blank-${idx}`} className="calendar-day-cell calendar-day-cell--empty" />
        ))}
        {daysArray.map((day) => {
          const isToday = day === dayNum;
          return (
            <div
              key={day}
              className={`calendar-day-cell ${isToday ? "calendar-day-cell--today" : ""}`}
            >
              <span>{day}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
