import React, { useState, useRef, useEffect } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

interface BotanicalDatePickerProps {
  value: string; // "YYYY-MM-DD"
  onChange: (dateStr: string) => void;
  max?: string;
  min?: string;
  name?: string;
  className?: string;
  ariaLabel?: string;
}

export function BotanicalDatePicker({
  name,
  value,
  onChange,
  max,
  min,
  className = '',
  ariaLabel = 'Select date',
}: BotanicalDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial viewing month from value or today
  const [viewYear, setViewYear] = useState(() => {
    const d = value ? new Date(value + 'T00:00:00') : new Date();
    return isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const d = value ? new Date(value + 'T00:00:00') : new Date();
    return isNaN(d.getTime()) ? new Date().getMonth() : d.getMonth();
  });

  // Keep view in sync when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [value]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const todayStr = new Date().toISOString().split('T')[0];

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Generate days for viewMonth / viewYear
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', {
    month: 'long',
  });

  const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // 0 = Mon
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(d);
  }

  // Format display string
  const formatDisplay = (val: string) => {
    if (!val) return 'Select date';
    const d = new Date(val + 'T00:00:00');
    if (isNaN(d.getTime())) return val;
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleSelectDay = (day: number) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const selectedStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
    onChange(selectedStr);
    setIsOpen(false);
  };

  return (
    <div className={`botanical-date-picker-wrap ${className}`} ref={containerRef}>
      {/* Hidden accessible input to support any form submit or test query */}
      <input
        type="date"
        name={name}
        aria-label={ariaLabel}
        value={value}
        max={max}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
      />

      {/* Styled Botanical Trigger Button */}
      <button
        type="button"
        className={`botanical-date-picker-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <CalendarDays size={15} className="trigger-icon" />
        <span className="trigger-label">{formatDisplay(value)}</span>
        <ChevronDown size={14} className={`trigger-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {/* Floating Botanical Popover */}
      {isOpen && (
        <div className="botanical-date-popover" role="dialog" aria-label="Calendar date picker">
          <div className="popover-header">
            <h4>
              {monthName} <span>{viewYear}</span>
            </h4>
            <div className="popover-nav">
              <button
                type="button"
                className="icon-button small"
                aria-label="Previous month"
                onClick={handlePrevMonth}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className="icon-button small"
                aria-label="Next month"
                onClick={handleNextMonth}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="popover-weekdays">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((w) => (
              <span key={w} className="popover-weekday">
                {w}
              </span>
            ))}
          </div>

          <div className="popover-days-grid">
            {days.map((day, idx) => {
              if (day === null) {
                return <span key={`blank-${idx}`} className="popover-day blank" />;
              }
              const pad = (n: number) => String(n).padStart(2, '0');
              const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
              const isSelected = dateStr === value;
              const isToday = dateStr === todayStr;
              const isFuture = max ? dateStr > max : false;
              const isPast = min ? dateStr < min : false;
              const isDisabled = isFuture || isPast;

              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={isDisabled}
                  className={`popover-day ${isSelected ? 'is-selected' : ''} ${
                    isToday ? 'is-today' : ''
                  }`}
                  onClick={() => handleSelectDay(day)}
                >
                  <span>{day}</span>
                  {isToday && !isSelected && <i className="today-dot" />}
                </button>
              );
            })}
          </div>

          <div className="popover-footer">
            <button
              type="button"
              className="text-button small"
              onClick={() => {
                onChange(todayStr);
                setIsOpen(false);
              }}
            >
              Today
            </button>
            <button
              type="button"
              className="outline small"
              onClick={() => setIsOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
