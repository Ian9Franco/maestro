"use client";

import { useEffect, useState } from "react";
import { useDesk } from "@/lib/store";

type Point = { x: number; y: number };
type Segment = { key: string; d: string; stroke: string; dash?: string };

export function ContextVectors() {
  const cursor = useDesk((state) => state.cursor);
  const boxes = useDesk((state) => state.boxes);
  const factors = useDesk((state) => state.factors);
  const steers = useDesk((state) => state.steers);
  const curve = useDesk((state) => state.curve);
  const page = useDesk((state) => state.page);
  const freshIndex = useDesk((state) => state.freshIndex);
  const selectedBoxId = useDesk((state) => state.selectedBoxId);
  const [segments, setSegments] = useState<Segment[]>([]);

  useEffect(() => {
    function measure() {
      const caret = pointOf(document.querySelector("[data-caret]"));
      const next: Segment[] = [];
      if (caret) {
        for (const pin of document.querySelectorAll<HTMLElement>("[data-pin]")) {
          const at = pointOf(pin);
          if (!at) continue;
          next.push({
            key: `pin-${pin.dataset.pin}`,
            d: line(caret, at),
            stroke: "rgba(255,255,255,0.72)",
          });
        }
        for (const dot of document.querySelectorAll<HTMLElement>("[data-factor-dot]")) {
          const at = pointOf(dot);
          if (!at || dot.getBoundingClientRect().width <= 0) continue;
          next.push({
            key: `steer-${dot.dataset.factorDot}`,
            d: line(caret, at),
            stroke: "#ff5530",
          });
        }
        for (const dot of document.querySelectorAll<HTMLElement>("[data-reading-dot]")) {
          const at = pointOf(dot);
          if (!at || dot.getBoundingClientRect().width <= 0) continue;
          next.push({
            key: `read-${dot.dataset.readingDot}`,
            d: line(caret, at),
            stroke: dot.dataset.contradict === "1" ? "#9eb7ff" : "#ff5530",
            dash: "3 4",
          });
        }
      }
      setSegments((current) => (sameSegments(current, next) ? current : next));
    }
    measure();
    const scroller = document.querySelector("[data-scroller]");
    scroller?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const frame = window.requestAnimationFrame(measure);
    return () => {
      scroller?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      window.cancelAnimationFrame(frame);
    };
  }, [boxes, cursor, curve, factors, freshIndex, page, selectedBoxId, steers]);

  return (
    <svg className="pointer-events-none fixed inset-0 z-20 h-screen w-screen" aria-hidden>
      {segments.map((segment) => (
        <path
          key={segment.key}
          d={segment.d}
          fill="none"
          stroke={segment.stroke}
          strokeWidth={1.05}
          strokeLinecap="round"
          strokeDasharray={segment.dash}
        />
      ))}
    </svg>
  );
}

function pointOf(element: Element | null): Point | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function line(from: Point, to: Point) {
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}

function sameSegments(current: Segment[], next: Segment[]) {
  if (current.length !== next.length) return false;
  return current.every(
    (item, index) =>
      item.key === next[index]?.key &&
      item.d === next[index]?.d &&
      item.stroke === next[index]?.stroke &&
      item.dash === next[index]?.dash,
  );
}
