"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useDesk } from "@/lib/store";
import { clamp, factorReadout } from "@/lib/text";

const CX = 220;
const CY = 132;
const R = 108;

export function Arc() {
  const factors = useDesk((state) => state.factors);
  const activeFactor = useDesk((state) => state.activeFactor);
  const setFactorValue = useDesk((state) => state.setFactorValue);
  const factor = factors.find((item) => item.id === activeFactor) ?? factors[0];
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const [kick, setKick] = useState(0);
  const velocity = useRef(0);
  const previous = useRef(factor.value);

  if (!factor) return null;
  const shown = clamp(factor.value + kick, -1, 1);
  const point = pointOnArc(shown);
  const readout = factorReadout({ ...factor, value: shown });
  const magnitude = Math.abs(shown);

  function valueFromEvent(event: ReactPointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return factor?.value ?? 0;
    const matrix = svg.getScreenCTM();
    if (!matrix) return factor?.value ?? 0;
    const pointer = svg.createSVGPoint();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const local = pointer.matrixTransform(matrix.inverse());
    const angle = Math.atan2(-(local.y - CY), local.x - CX);
    const bounded = clamp(angle, 0, Math.PI);
    return (1 - bounded / Math.PI) * 2 - 1;
  }

  return (
    <div className="pointer-events-none relative mx-auto h-[168px] w-[440px] max-w-full">
      <svg
        ref={svgRef}
        viewBox="0 0 440 168"
        className="pointer-events-auto h-[168px] w-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          setKick(0);
          const next = valueFromEvent(event);
          velocity.current = 0;
          previous.current = next;
          setFactorValue(factor.id, next);
        }}
        onPointerMove={(event) => {
          if (!dragging) return;
          const next = valueFromEvent(event);
          velocity.current = next - previous.current;
          previous.current = next;
          setFactorValue(factor.id, next);
        }}
        onPointerUp={() => {
          setDragging(false);
          const impulse = clamp(velocity.current * 8, -0.08, 0.08);
          if (Math.abs(impulse) < 0.01) return;
          setKick(impulse);
          window.setTimeout(() => setKick(0), 160);
        }}
      >
        <defs>
          <linearGradient id="tone-arc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#e7a3b6" />
            <stop offset="50%" stopColor="#f5f5f5" />
            <stop offset="100%" stopColor="#9aa6c9" />
          </linearGradient>
        </defs>
        <path
          d={arcPath()}
          fill="none"
          stroke="url(#tone-arc)"
          strokeWidth="1.4"
        />
        {[0, 0.25, 0.5, 0.75, 1].map((mark) => {
          const outer = pointOnArc(mark * 2 - 1, R + 8);
          const inner = pointOnArc(mark * 2 - 1, R - 6);
          return (
            <line
              key={mark}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="1"
            />
          );
        })}
        <text x="28" y="154" fill="rgba(255,255,255,0.55)" fontSize="13">
          {factor.neg}
        </text>
        <text x="360" y="154" fill="rgba(255,255,255,0.55)" fontSize="13">
          {factor.pos}
        </text>
        <text x="220" y="158" textAnchor="middle" fill="rgba(255,255,255,0.78)" fontSize="13">
          {factor.name}: {readout.word} {readout.pct}%
        </text>
      </svg>
      <div
        className="pointer-events-none absolute"
        style={{
          left: point.x,
          top: point.y,
          transition: dragging ? "none" : "left 250ms cubic-bezier(0.2, 1.35, 0.36, 1), top 250ms cubic-bezier(0.2, 1.35, 0.36, 1)",
        }}
      >
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{
            width: 16 + magnitude * 30,
            height: 16 + magnitude * 30,
            borderColor: shown < 0 ? "rgba(255,160,180,0.75)" : "rgba(255,70,50,0.8)",
            boxShadow: shown < 0 ? "0 0 16px rgba(255,150,170,0.35)" : "0 0 16px rgba(255,60,40,0.4)",
          }}
        />
        <div className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)]" />
      </div>
    </div>
  );
}

function pointOnArc(value: number, radius = R) {
  const angle = Math.PI * (1 - (value + 1) / 2);
  return {
    x: CX + radius * Math.cos(angle),
    y: CY - radius * Math.sin(angle),
  };
}

function arcPath() {
  const start = pointOnArc(-1);
  const end = pointOnArc(1);
  return `M ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y}`;
}
