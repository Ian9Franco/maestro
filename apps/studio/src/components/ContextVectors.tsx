"use client";

import { useEffect, useState } from "react";
import { useDesk } from "@/lib/store";

type Point = { x: number; y: number };
type Segment = { key: string; d: string };

export function ContextVectors() {
  const cursor = useDesk((state) => state.cursor);
  const boxes = useDesk((state) => state.boxes);
  const factors = useDesk((state) => state.factors);
  const page = useDesk((state) => state.page);
  const freshIndex = useDesk((state) => state.freshIndex);
  const selectedBoxId = useDesk((state) => state.selectedBoxId);
  const [segments, setSegments] = useState<Segment[]>([]);

  useEffect(() => {
    function measure() {
      const caret = pointOf(document.querySelector("[data-caret]"));
      const phrase = pointOf(document.querySelector("[data-phrase-end]"));
      const dots = [...document.querySelectorAll<HTMLElement>("[data-factor-dot]")].flatMap((dot) => {
        const at = pointOf(dot);
        if (!at || dot.getBoundingClientRect().width <= 0) return [];
        return [{ id: dot.dataset.factorDot ?? "factor", at }];
      });
      const origin = caret ?? phrase;
      const next: Segment[] = [];
      if (phrase && caret && distance(phrase, caret) > 12) {
        next.push({ key: "frase", d: curve(phrase, caret) });
      }
      if (origin) {
        for (const dot of dots) {
          next.push({ key: dot.id, d: curve(origin, dot.at) });
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
  }, [boxes, cursor, factors, freshIndex, page, selectedBoxId]);

  return (
    <svg className="pointer-events-none fixed inset-0 z-20 h-screen w-screen" aria-hidden>
      {segments.map((segment) => (
        <path key={segment.key} d={segment.d} fill="none" stroke="#ff5530" strokeWidth={1.15} strokeLinecap="round" />
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

function curve(from: Point, to: Point) {
  const midX = from.x + (to.x - from.x) * 0.55;
  const bow = Math.max(18, Math.min(72, Math.abs(to.y - from.y) * 0.2));
  return `M ${from.x} ${from.y} C ${midX} ${from.y - bow * 0.15}, ${midX} ${to.y}, ${to.x} ${to.y}`;
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function sameSegments(current: Segment[], next: Segment[]) {
  if (current.length !== next.length) return false;
  return current.every((item, index) => item.key === next[index]?.key && item.d === next[index]?.d);
}
