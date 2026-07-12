"use client";

import { useEffect, useRef, useState } from "react";
import { DATE_RANGE_OPTIONS, dateRangeLabel, type DashboardDateRange } from "@nutriai/dashboard-core";

interface Props {
  value: DashboardDateRange;
  onChange: (range: DashboardDateRange) => void;
}

/** Compact dropdown used as the dashboard's single global date-range
 * control — no existing pattern for this in the codebase, so kept simple:
 * a button that opens a small menu, closes on outside click/Escape. */
export function DateRangeSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-dashboard-primary)] bg-[var(--color-dashboard-primary-light)] hover:bg-[var(--color-dashboard-primary-light)]/70 rounded-full px-3.5 py-2 transition-colors"
      >
        {dateRangeLabel(value)}
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-20 mt-2 w-44 bg-white rounded-xl border border-gray-100 shadow-lg py-1.5 overflow-hidden"
        >
          {DATE_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full text-left text-sm px-3.5 py-2 transition-colors ${
                opt.value === value
                  ? "bg-[var(--color-dashboard-primary-light)] text-[var(--color-dashboard-primary)] font-semibold"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
