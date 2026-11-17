"use client";

import { useEffect, useRef, useState } from "react";
import { useDesk } from "@/lib/store";
import { planeAxes, vectorMix, vectorPaint, type Plane } from "@/lib/text";
import { useCompactViewport } from "@/lib/viewport";

type Point = { x: number; y: number };
type Trail = { x: number; y: number; color: string };

const ROSE: Plane[] = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
];

export function Origin() {
  const lines = useDesk((state) => state.lines);
  const cursor = useDesk((state) => state.cursor);
  const freshIndex = useDesk((state) => state.freshIndex);
  const plane = useDesk((state) => state.plane);
  const steering = useDesk((state) => state.steering);
  const rewinding = useDesk((state) => state.rewinding);
  const setPlane = useDesk((state) => state.setPlane);
  const beginSteer = useDesk((state) => state.beginSteer);
  const endSteer = useDesk((state) => state.endSteer);
  const [caret, setCaret] = useState<Point | null>(null);
  const [viewportH, setViewportH] = useState(0);
  const [trail, setTrail] = useState<Trail[]>([]);
  const dragging = useRef(false);
  const trailToken = useRef(0);
  const compact = useCompactViewport();

  useEffect(() => {
    function measure() {
      const next = pointOf(document.querySelector("[data-caret]"));
      setCaret((current) => (samePoint(current, next) ? current : next));
      setViewportH((current) => (current === window.innerHeight ? current : window.innerHeight));
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
  }, [cursor, freshIndex, lines]);

  useEffect(() => {
    if (!rewinding) return;
    setTrail([]);
  }, [rewinding]);

  useEffect(() => {
    const scroller = document.querySelector("[data-scroller]");
    const caretEl = document.querySelector("[data-caret]");
    if (!scroller || !(caretEl instanceof HTMLElement)) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const caretRect = caretEl.getBoundingClientRect();
    const target = scrollerRect.top + scrollerRect.height * 0.3;
    if (Math.abs(caretRect.top - target) < 48) return;
    scroller.scrollBy({ top: caretRect.top - target });
  }, [compact, cursor, lines]);

  if (!caret) return null;

  const reach = compact ? 48 : 68;
  const drop = compact ? 248 : 176;
  const timeline = compact ? 92 : 40;
  const paint = vectorPaint(plane.x, plane.y);
  const axes = planeAxes(lines, cursor);
  const mix = vectorMix(plane.x, plane.y, axes);
  const origin = {
    x: caret.x,
    y: Math.min(caret.y + drop, Math.max(caret.y + 36, (viewportH || caret.y + drop) - timeline - reach - 24)),
  };
  const node = {
    x: origin.x + plane.x * reach,
    y: origin.y - plane.y * reach,
  };
  const ringWidth = rewinding ? 1.2 : paint.width;
  const ringR = (rewinding ? 0.62 : 1) * (8 + ringWidth / 2);
  const ease = steering ? "none" : "left 200ms ease, top 200ms ease";

  function planeFromPointer(clientX: number, clientY: number): Plane {
    const dx = (clientX - origin.x) / reach;
    const dy = (origin.y - clientY) / reach;
    const mag = Math.hypot(dx, dy);
    if (mag <= 1) return { x: dx, y: dy };
    return { x: dx / mag, y: dy / mag };
  }

  function release() {
    if (!dragging.current) return;
    dragging.current = false;
    endSteer();
    const token = trailToken.current;
    window.setTimeout(() => {
      if (trailToken.current === token) setTrail([]);
    }, 220);
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[25]">
      <svg className="h-full w-full overflow-visible" aria-hidden>
        <line x1={caret.x} y1={caret.y} x2={origin.x} y2={origin.y} stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
        <circle cx={caret.x} cy={caret.y} r={2.5} fill="#fff" />
        <circle cx={origin.x} cy={origin.y} r={reach} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
        <line
          x1={origin.x - reach}
          y1={origin.y}
          x2={origin.x + reach}
          y2={origin.y}
          stroke="rgba(255,255,255,0.22)"
          strokeWidth={1}
        />
        <line
          x1={origin.x}
          y1={origin.y - reach}
          x2={origin.x}
          y2={origin.y + reach}
          stroke="rgba(255,255,255,0.22)"
          strokeWidth={1}
        />
        {ROSE.map((dir) => {
          const at = screenOf(origin, reach + 12, dir);
          const angle = (Math.atan2(at.y - origin.y, at.x - origin.x) * 180) / Math.PI;
          const opacity = rewinding ? 0.2 : roseOpacity(dir, plane);
          return (
            <g
              key={`${dir.x}-${dir.y}`}
              transform={`translate(${at.x} ${at.y}) rotate(${angle})`}
              opacity={opacity}
              style={{ transition: "opacity 200ms ease" }}
            >
              <path d="M -6 -3.2 L 5 0 L -6 3.2" fill="none" stroke="white" strokeWidth={1.25} strokeLinejoin="round" />
            </g>
          );
        })}
        {trail.map((point, index) => (
          <circle
            key={`${point.x}-${point.y}-${index}`}
            cx={point.x}
            cy={point.y}
            r={3.5}
            fill={point.color}
            opacity={((index + 1) / trail.length) * 0.55}
          />
        ))}
        <circle
          cx={node.x}
          cy={node.y}
          r={ringR}
          fill="#000"
          stroke={rewinding ? "#8d8d8d" : paint.ring}
          strokeWidth={ringWidth}
          className={rewinding ? "vector-shimmer" : undefined}
          style={{
            transition: steering
              ? "stroke 200ms ease, stroke-width 200ms ease"
              : "cx 200ms ease, cy 200ms ease, r 200ms ease, stroke 200ms ease, stroke-width 200ms ease",
          }}
        />
      </svg>

      <AxisLabel x={origin.x - reach - (compact ? 28 : 36)} y={origin.y} dim={rewinding}>
        {axes.left}
      </AxisLabel>
      <AxisLabel x={origin.x + reach + (compact ? 28 : 36)} y={origin.y} dim={rewinding}>
        {axes.right}
      </AxisLabel>
      <AxisLabel x={origin.x} y={origin.y - reach - (compact ? 16 : 20)} dim={rewinding}>
        {axes.up}
      </AxisLabel>
      <AxisLabel x={origin.x} y={origin.y + reach + (compact ? 16 : 20)} dim={rewinding}>
        {axes.down}
      </AxisLabel>
      <span
        className="mono absolute -translate-x-1/2 text-[11px] whitespace-nowrap text-white/70"
        style={{
          left: origin.x,
          top: origin.y + reach + (compact ? 30 : 36),
          opacity: rewinding ? 0.35 : 1,
          transition: "opacity 200ms ease",
        }}
      >
        {mix}
      </span>

      <button
        type="button"
        data-vector={paint.color}
        data-rewinding={rewinding ? "1" : "0"}
        data-tension={paint.tension.toFixed(2)}
        aria-label={
          rewinding
            ? "Rebobinando. El vector se apaga y se recalcula."
            : `Vector. ${mix}. Arrastrá para mezclar tono, foco y tensión.`
        }
        className="pointer-events-auto absolute z-30 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full active:cursor-grabbing"
        style={{
          left: node.x,
          top: node.y,
          width: compact ? 44 : 36,
          height: compact ? 44 : 36,
          transition: ease,
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragging.current = true;
          trailToken.current += 1;
          setTrail([]);
          beginSteer();
        }}
        onPointerMove={(event) => {
          if (!dragging.current) return;
          const next = planeFromPointer(event.clientX, event.clientY);
          setPlane(next.x, next.y);
          const color = vectorPaint(next.x, next.y).color;
          setTrail((current) => {
            const last = current[current.length - 1];
            if (last && Math.hypot(last.x - event.clientX, last.y - event.clientY) < 8) return current;
            return [...current, { x: event.clientX, y: event.clientY, color }].slice(-8);
          });
        }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <span
          className="absolute top-1/2 left-1/2 rounded-full"
          style={{
            width: 14,
            height: 14,
            marginLeft: -7,
            marginTop: -7,
            background: rewinding ? "#8a8a8a" : paint.color,
            boxShadow: rewinding ? "none" : `0 0 12px ${paint.color}`,
            transform: rewinding ? "scale(0.7)" : "scale(1)",
            transition: "background-color 200ms ease, transform 200ms ease, box-shadow 200ms ease",
          }}
        />
      </button>
    </div>
  );
}

function AxisLabel({ x, y, dim, children }: { x: number; y: number; dim: boolean; children: string }) {
  return (
    <span
      className="mono absolute -translate-x-1/2 -translate-y-1/2 text-[10px] whitespace-nowrap text-white/50"
      style={{ left: x, top: y, opacity: dim ? 0.25 : 1, transition: "opacity 200ms ease" }}
    >
      {children}
    </span>
  );
}

function screenOf(origin: Point, radius: number, dir: Plane): Point {
  const len = Math.hypot(dir.x, dir.y) || 1;
  return { x: origin.x + (dir.x / len) * radius, y: origin.y - (dir.y / len) * radius };
}

function roseOpacity(dir: Plane, plane: Plane) {
  const mag = Math.hypot(plane.x, plane.y);
  if (mag < 0.12) return 0.35;
  const len = Math.hypot(dir.x, dir.y) || 1;
  const dot = (dir.x / len) * (plane.x / mag) + (dir.y / len) * (plane.y / mag);
  return dot > 0.5 ? 1 : 0.2;
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
