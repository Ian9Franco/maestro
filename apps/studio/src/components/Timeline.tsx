"use client";

import { useRef } from "react";
import { useDesk } from "@/lib/store";
import { wordsOf } from "@/lib/text";

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
  const shown = lines.slice(0, cursor);
  const wordCount = shown.reduce((sum, line) => sum + wordsOf(line).length, 0);
  const tokens = Math.round(shown.join(" ").length / 4);

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex h-7 items-center bg-black">
      <div className="mono flex shrink-0 items-center gap-3 px-3 text-[10px] tracking-wide text-white/40 sm:gap-4 sm:px-4">
        <span>{wordCount}w</span>
        <span className="hidden sm:inline">{tokens} tok</span>
        <span>paso {cursor}</span>
      </div>
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={lines.length}
        aria-valuenow={cursor}
        aria-label="Playhead"
        tabIndex={0}
        className="relative h-full min-w-0 flex-1 cursor-ew-resize touch-none"
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
        <div className="absolute top-1/2 right-4 left-2 h-px bg-white/20" />
        {lines.map((_, index) => (
          <span
            key={index}
            className="absolute top-1/2 h-1.5 w-px -translate-y-1/2"
            style={{
              left: `calc(${((index + 0.5) / max) * 100}% - 8px)`,
              background: index < revealed ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.14)",
            }}
          />
        ))}
        <span
          className="absolute top-1 bottom-1 w-px bg-[#ff4b2a]"
          style={{
            left: `calc(${left} - 8px)`,
            boxShadow:
              freshIndex !== null
                ? "0 0 12px 2px rgba(255,70,40,0.95)"
                : "0 0 6px rgba(255,70,40,0.45)",
          }}
        />
      </div>
    </div>
  );
}
