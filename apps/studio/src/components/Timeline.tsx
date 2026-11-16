"use client";

import { useRef } from "react";
import { PAGE_SIZE, useDesk } from "@/lib/store";
import { passageBoxes, wordsOf } from "@/lib/text";

export function Timeline() {
  const lines = useDesk((state) => state.lines);
  const cursor = useDesk((state) => state.cursor);
  const freshIndex = useDesk((state) => state.freshIndex);
  const page = useDesk((state) => state.page);
  const history = useDesk((state) => state.history.length);
  const cutTo = useDesk((state) => state.cutTo);
  const beginGesture = useDesk((state) => state.beginGesture);
  const endGesture = useDesk((state) => state.endGesture);
  const undo = useDesk((state) => state.undo);
  const boxes = useDesk((state) => state.boxes);
  const steers = useDesk((state) => state.steers);
  const factors = useDesk((state) => state.factors);
  const activeFactor = useDesk((state) => state.activeFactor);
  const setPage = useDesk((state) => state.setPage);
  const trackRef = useRef<HTMLDivElement>(null);

  function seek(clientX: number) {
    const track = trackRef.current;
    if (!track || lines.length === 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    cutTo(Math.round(ratio * lines.length));
  }

  const pages = Math.max(1, Math.ceil(Math.max(cursor, 1) / PAGE_SIZE));

  const max = Math.max(lines.length, 1);
  const left = `${(cursor / max) * 100}%`;
  const shown = lines;
  const wordCount = shown.reduce((sum, line) => sum + wordsOf(line).length, 0);
  const tokens = Math.round(shown.join(" ").length / 4);

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex h-7 items-center bg-black">
      <div className="mono flex shrink-0 items-center gap-3 px-3 text-[10px] tracking-wide text-white/40 sm:gap-4 sm:px-4">
        <span>{wordCount}w</span>
        <span className="hidden sm:inline">{tokens} tok</span>
        <span>paso {cursor}</span>
        <span>
          cajas {passageBoxes(lines, cursor, boxes, factors.find((factor) => factor.id === activeFactor)?.value ?? 0).length}
        </span>
        <span>rumbo {steers.length}</span>
        <span>pin {boxes.filter((box) => box.lineIndex < cursor).length}</span>
        <span className="inline-flex items-center gap-1">
          <button type="button" className="px-1 text-white/70 disabled:text-white/20" disabled={page <= 0} onClick={() => setPage(page - 1)}>
            ‹
          </button>
          pág {page + 1}/{pages}
          <button
            type="button"
            className="px-1 text-white/70 disabled:text-white/20"
            disabled={page >= pages - 1}
            onClick={() => setPage(page + 1)}
          >
            ›
          </button>
        </span>
        <button type="button" className="text-white/70 disabled:text-white/20" disabled={history === 0} onClick={undo}>
          deshacer
        </button>
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
          beginGesture();
          event.currentTarget.setPointerCapture(event.pointerId);
          seek(event.clientX);
        }}
        onPointerUp={() => {
          endGesture();
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
              background: "rgba(255,255,255,0.4)",
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
