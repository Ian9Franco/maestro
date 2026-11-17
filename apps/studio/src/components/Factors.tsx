"use client";

import { useEffect, useState } from "react";
import { useDesk } from "@/lib/store";
import { diagnose, factorReadout, type Factor } from "@/lib/text";

const DOT: Record<string, string> = {
  tono: "#ff4d3a",
  tension: "#ff8a3d",
  ritmo: "#f0c6cc",
  foco: "#f4f4f4",
  modo: "#ffb089",
  distancia: "#9eb7ff",
  cierre: "#d7dde8",
  sorpresa: "#ff5a3c",
};

export function Factors({ layout = "rail" }: { layout?: "rail" | "row" }) {
  const factors = useDesk((state) => state.factors);
  const steers = useDesk((state) => state.steers);
  const lines = useDesk((state) => state.lines);
  const cursor = useDesk((state) => state.cursor);
  const boxes = useDesk((state) => state.boxes);
  const activeFactor = useDesk((state) => state.activeFactor);
  const setActiveFactor = useDesk((state) => state.setActiveFactor);
  const readings = diagnose(lines, cursor, boxes, factors, steers);
  const signature = `${cursor}:${boxes.map((box) => box.id).join(",")}`;
  const realized = useRealized(signature);

  const steerChips = steers.flatMap((id) => {
    const factor = factors.find((item) => item.id === id);
    return factor ? [factor] : [];
  });

  if (steerChips.length === 0 && readings.length === 0) return null;

  return (
    <div
      className={
        layout === "row"
          ? "mobile-chip-rail flex min-w-0 flex-1 items-center gap-3 overflow-x-auto overscroll-x-contain py-0.5"
          : "flex flex-col items-start gap-3 px-4 pt-4"
      }
    >
      {steerChips.map((factor) => (
        <Chip
          key={factor.id}
          factor={factor}
          word={factorReadout(factor).word}
          pct={factorReadout(factor).pct}
          active={factor.id === activeFactor}
          filled={1}
          realized={false}
          contradicts={false}
          onOpen={() => setActiveFactor(factor.id)}
          link="solid"
        />
      ))}
      {readings.map((reading) => {
        const factor = factors.find((item) => item.id === reading.id);
        if (!factor) return null;
        return (
          <Chip
            key={`read-${reading.id}`}
            factor={factor}
            word={reading.word}
            pct={reading.pct}
            active={reading.id === activeFactor}
            filled={realized * (reading.pct / 100)}
            realized={realized < 1}
            contradicts={reading.contradicts}
            onOpen={() => setActiveFactor(reading.id)}
            link="dashed"
          />
        );
      })}
    </div>
  );
}

function Chip({
  factor,
  word,
  pct,
  active,
  filled,
  realized,
  contradicts,
  onOpen,
  link,
}: {
  factor: Factor;
  word: string;
  pct: number;
  active: boolean;
  filled: number;
  realized: boolean;
  contradicts: boolean;
  onOpen: () => void;
  link: "solid" | "dashed";
}) {
  const color = contradicts ? "#9eb7ff" : (DOT[factor.id] ?? "#ff8a3d");
  return (
    <button
      type="button"
      onClick={onOpen}
      data-factor={link === "solid" ? factor.id : undefined}
      className={`flex min-h-11 min-w-max shrink-0 items-baseline gap-2 text-left text-[11px] leading-none transition-opacity hover:opacity-100 sm:min-h-0 sm:text-[13px] ${active ? "opacity-100" : "opacity-75"}`}
    >
      <span
        data-factor-dot={link === "solid" ? factor.id : undefined}
        data-factor-link={link === "solid" ? "solid" : undefined}
        data-reading-dot={link === "dashed" ? factor.id : undefined}
        data-contradict={contradicts ? "1" : undefined}
        className="relative h-2 w-2 shrink-0 translate-y-px rounded-full border"
        style={{ borderColor: color, boxShadow: active ? `0 0 8px ${color}` : undefined }}
      >
        <span
          className="absolute inset-0 rounded-full"
          style={{ background: color, transform: `scale(${Math.max(0, Math.min(1, filled))})` }}
        />
      </span>
      <span>
        <span className="text-white/55">{factor.name}: </span>
        <span style={{ color: contradicts ? "#9eb7ff" : wordColor(factor), transition: "color 200ms ease" }}>{word} </span>
        <span className="text-white/90">
          {pct}%{realized ? " realizado" : ""}
        </span>
      </span>
    </button>
  );
}

function wordColor(factor: Factor): string {
  if (Math.abs(factor.value) < 0.08) return "rgba(255,255,255,0.78)";
  if (factor.id === "tono") return factor.value < 0 ? "#f0b4c4" : "#a9bce4";
  if (factor.id === "tension") return factor.value < 0 ? "#f0c6cc" : "#ff5a3c";
  return factor.value < 0 ? "#ffb089" : "#f7f7f7";
}

function useRealized(signature: string) {
  const [value, setValue] = useState(1);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(1);
      return;
    }
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const next = Math.min(1, (now - started) / 700);
      setValue(next);
      if (next < 1) frame = window.requestAnimationFrame(tick);
    };
    setValue(0);
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [signature]);
  return value;
}
