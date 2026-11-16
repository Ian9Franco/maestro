"use client";

import { useRef } from "react";
import { useDesk } from "@/lib/store";

export function Timeline() {
  const lines = useDesk((state) => state.lines);
  const cursor = useDesk((state) => state.cursor);
  const revealed = useDesk((state) => state.revealed);
  const freshIndex = useDesk((state) => state.freshIndex);
  const setCursor = useDesk((state) => state.setCursor);
  const trackRef = useRef<HTMLDivElement>(null);
  const gestureCeiling = useRef<number | null>(null);

  function seek(clientX: number) {
    const track = trackRef.current;
    if (!track || lines.length === 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const target = Math.round(ratio * lines.length);
    const ceiling = gestureCeiling.current;
    setCursor(ceiling === null ? target : Math.min(target, ceiling));
  }

  const max = Math.max(lines.length, 1);
  const left = `${(cursor / max) * 100}%`;

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 h-11 border-t border-white/10 bg-black/50 backdrop-blur-sm">
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={lines.length}
        aria-valuenow={cursor}
        aria-label="Playhead"
        tabIndex={0}
        className="relative mx-8 h-full cursor-ew-resize touch-none"
        onPointerDown={(event) => {
          gestureCeiling.current = revealed + 1;
          event.currentTarget.setPointerCapture(event.pointerId);
          seek(event.clientX);
        }}
        onPointerUp={() => {
          gestureCeiling.current = null;
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) seek(event.clientX);
        }}
      >
        <div className="absolute top-1/2 right-0 left-0 h-px bg-white/20" />
        {lines.map((_, index) => (
          <span
            key={index}
            className="absolute top-1/2 h-2 w-px -translate-y-1/2"
            style={{
              left: `${((index + 0.5) / max) * 100}%`,
              background: index < revealed ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.15)",
            }}
          />
        ))}
        <span
          className="absolute top-1 bottom-1 w-px bg-sky-200"
          style={{
            left,
            boxShadow: freshIndex !== null ? "0 0 12px 2px rgba(90, 180, 255, 0.95)" : "0 0 6px rgba(140, 190, 255, 0.45)",
          }}
        />
      </div>
    </div>
  );
}
