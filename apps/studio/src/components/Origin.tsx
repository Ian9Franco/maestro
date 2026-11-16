"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useDesk } from "@/lib/store";
import { admitFactors, clamp, factorReadout, wordsOf, type Factor } from "@/lib/text";

type Point = { x: number; y: number };

export function Origin() {
  const curve = useDesk((state) => state.curve);
  const factors = useDesk((state) => state.factors);
  const steers = useDesk((state) => state.steers);
  const lines = useDesk((state) => state.lines);
  const cursor = useDesk((state) => state.cursor);
  const freshIndex = useDesk((state) => state.freshIndex);
  const openCurve = useDesk((state) => state.openCurve);
  const setFactorValue = useDesk((state) => state.setFactorValue);
  const [caret, setCaret] = useState<Point | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [kick, setKick] = useState(0);
  const dragging = useRef(false);
  const velocity = useRef(0);
  const previous = useRef(0);

  useEffect(() => {
    if (curve === "closed") return;
    const scroller = document.querySelector("[data-scroller]");
    const caretEl = document.querySelector("[data-caret]");
    if (!scroller || !caretEl) return;
    const top = caretEl.getBoundingClientRect().top;
    if (Math.abs(top - 200) > 48) scroller.scrollBy({ top: top - 200 });
  }, [curve]);

  useEffect(() => {
    function measure() {
      const next = pointOf(document.querySelector("[data-caret]"));
      setCaret((current) => (samePoint(current, next) ? current : next));
      setSize((current) => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        return current.w === w && current.h === h ? current : { w, h };
      });
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
  }, [cursor, curve, freshIndex, lines]);

  const expanded = curve !== "closed" && curve !== "ring" ? factors.find((factor) => factor.id === curve) : undefined;
  const shown = expanded ? clamp(expanded.value + kick, -1, 1) : 0;

  if (!caret || size.w === 0) return null;

  const room = size.h - caret.y - 48;
  const radius = Math.max(96, Math.min(148, room - 24));
  const admitted = admitFactors(lines, cursor, factors);
  const ring = [...admitted];
  for (const id of steers) {
    const factor = factors.find((item) => item.id === id);
    if (factor && !ring.some((item) => item.id === factor.id)) ring.push(factor);
  }
  const menu = ring.slice(0, 6);
  const words = lines.slice(0, cursor).reduce((sum, line) => sum + wordsOf(line).length, 0);
  const readout = expanded ? factorReadout({ ...expanded, value: shown }) : null;

  function valueFromEvent(event: ReactPointerEvent<SVGPathElement>) {
    const angle = Math.atan2(event.clientY - caret!.y, event.clientX - caret!.x);
    const bounded = clamp(angle, 0, Math.PI);
    return (1 - bounded / Math.PI) * 2 - 1;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[25]">
      <svg className="h-full w-full overflow-visible" aria-hidden>
        <line x1={caret.x} y1={0} x2={caret.x} y2={size.h - 28} stroke="rgba(255,45,45,0.78)" strokeWidth={1} />
        <line x1={0} y1={caret.y} x2={size.w} y2={caret.y} stroke="rgba(255,45,45,0.5)" strokeWidth={1} />
        {curve === "ring"
          ? menu.map((factor, index) => {
              const at = place(caret, menuRadius(radius), slotValue(index, menu.length));
              const tick = place(caret, menuRadius(radius) - 8, slotValue(index, menu.length));
              return (
                <line
                  key={factor.id}
                  x1={tick.x}
                  y1={tick.y}
                  x2={at.x}
                  y2={at.y}
                  stroke="rgba(255,255,255,0.45)"
                  strokeWidth={1}
                />
              );
            })
          : null}
        {curve === "ring" ? (
          <path
            d={arcPath(caret.x, caret.y, menuRadius(radius), -1, 1)}
            fill="none"
            stroke="rgba(255,255,255,0.72)"
            strokeWidth={1}
            strokeDasharray="2 5"
          />
        ) : null}
        {expanded ? (
          <>
            <path
              d={arcPath(caret.x, caret.y, radius * 0.62, -1, 1)}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={1}
            />
            <path
              d={arcPath(caret.x, caret.y, radius * 0.84, -1, 1)}
              fill="none"
              stroke="rgba(255,255,255,0.16)"
              strokeWidth={1}
            />
            {[-0.5, 0, 0.5].map((mark) => {
              const inner = place(caret, radius * 0.72, mark);
              const outer = place(caret, radius * 0.9, mark);
              return (
                <line
                  key={mark}
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke="rgba(255,255,255,0.35)"
                  strokeWidth={1}
                />
              );
            })}
            {Math.abs((shown < 0 ? shown + 1 : 1 - shown)) > 0.02 ? (
              <path
                d={arcPath(caret.x, caret.y, radius, shown < 0 ? -1 : shown, shown < 0 ? shown : 1)}
                fill="none"
                stroke="#ff4b2a"
                strokeWidth={2.4}
                strokeLinecap="round"
              />
            ) : null}
            {Math.abs(shown < 0 ? 1 - shown : shown + 1) > 0.02 ? (
              <path
                d={arcPath(caret.x, caret.y, radius, shown < 0 ? shown : -1, shown < 0 ? 1 : shown)}
                fill="none"
                stroke="rgba(255,255,255,0.78)"
                strokeWidth={1.4}
                strokeLinecap="round"
              />
            ) : null}
            <path
              d={arcPath(caret.x, caret.y, radius, -1, 1)}
              fill="none"
              stroke="transparent"
              strokeWidth={28}
              className="pointer-events-auto cursor-grab"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                dragging.current = true;
                setKick(0);
                const next = valueFromEvent(event);
                velocity.current = 0;
                previous.current = next;
                setFactorValue(expanded.id, next);
              }}
              onPointerMove={(event) => {
                if (!dragging.current) return;
                const next = valueFromEvent(event);
                velocity.current = next - previous.current;
                previous.current = next;
                setFactorValue(expanded.id, next);
              }}
              onPointerUp={() => {
                dragging.current = false;
                const impulse = clamp(velocity.current * 8, -0.08, 0.08);
                if (Math.abs(impulse) < 0.01) return;
                setKick(impulse);
                window.setTimeout(() => setKick(0), 160);
              }}
            />
            <line
              x1={caret.x}
              y1={caret.y}
              x2={place(caret, radius, shown).x}
              y2={place(caret, radius, shown).y}
              stroke="rgba(255,255,255,0.85)"
              strokeWidth={1}
            />
          </>
        ) : null}
      </svg>

      {curve !== "closed" ? (
        <span
          className="mono absolute rounded bg-black/80 px-1 text-[10px] text-white/70"
          style={{ left: caret.x + 14, top: caret.y - 22 }}
        >
          {words} palabras
        </span>
      ) : null}

      {curve === "ring"
        ? menu.map((factor, index) => {
            const at = place(caret, menuRadius(radius), slotValue(index, menu.length));
            const steered = steers.includes(factor.id);
            return (
              <button
                key={factor.id}
                type="button"
                className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 text-[11px] whitespace-nowrap ${steered ? "text-white" : "text-white/70"}`}
                style={{ left: at.x, top: at.y + 14 }}
                onClick={() => openCurve(factor.id)}
              >
                {factor.name}
              </button>
            );
          })
        : null}

      {expanded && readout
        ? marksOf(expanded).map((mark) => {
            const at = place(caret, radius + 16, mark.at);
            const chosen = mark.word === readout.word;
            return (
              <span
                key={`${mark.word}-${mark.at}`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 text-[11px] whitespace-nowrap ${chosen ? "rounded-sm bg-[#ff3b1f] px-1.5 py-0.5 text-white" : "text-white/55"}`}
                style={{ left: at.x, top: at.y }}
              >
                {mark.word}
              </span>
            );
          })
        : null}

      {expanded && readout ? (
        <span
          className="absolute -translate-x-1/2 text-[12px] whitespace-nowrap text-white/80"
          style={{ left: caret.x, top: caret.y + radius + 22 }}
        >
          {expanded.name}: <span style={{ color: poleColor(shown) }}>{readout.word}</span> {readout.pct}%
        </span>
      ) : null}

      {curve !== "closed"
        ? steers
            .filter((id) => id !== expanded?.id)
            .map((id, index, list) => {
              const factor = factors.find((item) => item.id === id);
              if (!factor) return null;
              const read = factorReadout(factor);
              const at = place(caret, 44, slotValue(index, list.length));
              return (
                <button
                  key={id}
                  type="button"
                  className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 text-[10px] whitespace-nowrap text-white/80"
                  style={{ left: at.x, top: at.y }}
                  onClick={() => openCurve(id)}
                >
                  {factor.name}: {read.word}
                </button>
              );
            })
        : null}
    </div>
  );
}

function menuRadius(radius: number) {
  return Math.min(128, radius * 0.86);
}

function slotValue(index: number, count: number) {
  if (count <= 1) return 0;
  return -0.58 + (1.16 * index) / (count - 1);
}

function place(origin: Point, radius: number, value: number): Point {
  const angle = Math.PI * (1 - (clamp(value, -1, 1) + 1) / 2);
  return { x: origin.x + radius * Math.cos(angle), y: origin.y + radius * Math.sin(angle) };
}

function arcPath(cx: number, cy: number, radius: number, from: number, to: number) {
  const start = place({ x: cx, y: cy }, radius, from);
  const end = place({ x: cx, y: cy }, radius, to);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 0 ${end.x} ${end.y}`;
}

function marksOf(factor: Factor) {
  return [{ at: -1, word: factor.neg }, ...(factor.stops ?? []), { at: 1, word: factor.pos }];
}

function poleColor(value: number) {
  if (Math.abs(value) < 0.08) return "rgba(255,255,255,0.8)";
  return value < 0 ? "#ffb089" : "#ff5a3c";
}

function pointOf(element: Element | null): Point | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function samePoint(current: Point | null, next: Point | null) {
  if (current === null || next === null) return current === next;
  return Math.abs(current.x - next.x) < 0.5 && Math.abs(current.y - next.y) < 0.5;
}
