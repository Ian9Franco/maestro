"use client";

import { useEffect, useMemo, useState } from "react";
import { PAGE_SIZE, useDesk } from "@/lib/store";
import {
  type AttentionBox,
  barColor,
  hashString,
  normalizeP95,
  rawLineScore,
  rawSpanScore,
  sparkProfile,
  type SourceDoc,
} from "@/lib/text";

const REEL_HINT =
  "Muestra qué partes pesan en la próxima oración. Arrastrá una frase para meterla en el prompt.";

type SourceBar = {
  key: string;
  docName: string;
  span: string;
  raw: number;
  height: number;
};

export function Reel({ heights }: { heights: number[] }) {
  const lines = useDesk((state) => state.lines);
  const revealed = useDesk((state) => state.revealed);
  const cursor = useDesk((state) => state.cursor);
  const boxes = useDesk((state) => state.boxes);
  const docs = useDesk((state) => state.docs);
  const factors = useDesk((state) => state.factors);
  const activeFactor = useDesk((state) => state.activeFactor);
  const freshIndex = useDesk((state) => state.freshIndex);
  const page = useDesk((state) => state.page);
  const factorValue = factors.find((factor) => factor.id === activeFactor)?.value ?? 0;

  const debounced = useDebounced(
    JSON.stringify({
      boxes,
      factorValue,
      revealed,
      docs: docs.map((doc) => ({ id: doc.id, spans: doc.spans })),
    }),
    100,
  );
  const parsed = JSON.parse(debounced) as {
    boxes: AttentionBox[];
    factorValue: number;
    revealed: number;
    docs: { id: string; spans: string[] }[];
  };

  const energies = useMemo(() => {
    const raw = lines
      .slice(0, parsed.revealed)
      .map((line, index) => rawLineScore(line, index, parsed.boxes, parsed.factorValue));
    return normalizeP95(raw);
  }, [lines, parsed]);

  const hot = useMemo(() => {
    const ranked = energies
      .map((value, index) => ({ value, index }))
      .filter((item) => item.index < cursor && item.value > 55)
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
    return new Set(ranked.map((item) => item.index));
  }, [cursor, energies]);

  const sourceBars = useMemo(() => {
    const fromDocs: SourceDoc[] = parsed.docs.map((doc) => ({
      id: doc.id,
      name: docs.find((item) => item.id === doc.id)?.name ?? "Documento",
      kind: "notas",
      text: "",
      spans: doc.spans,
    }));
    return topSourceBars(fromDocs, parsed.factorValue);
  }, [docs, parsed]);

  const [tip, setTip] = useState<{ x: number; y: number; title: string; body: string } | null>(null);

  return (
    <div className="w-[56px] shrink-0 sm:w-[112px]" title={REEL_HINT} aria-label={REEL_HINT}>
      <div className="flex h-8 items-end justify-end gap-px pr-2">
        <span className="hidden w-8 sm:block" />
        <span className="flex h-5 w-[34px] items-end justify-center gap-px">
          {sourceBars.map((bar) => (
            <button
              key={bar.key}
              type="button"
              className="relative h-full w-[2px]"
              aria-label={`${bar.docName}: ${bar.span}`}
              onMouseEnter={(event) =>
                setTip({ x: event.clientX, y: event.clientY, title: bar.docName, body: bar.span })
              }
              onMouseLeave={() => setTip(null)}
            >
            <span
              className="bar-fill absolute inset-x-0 bottom-0 rounded-[1px]"
              style={{
                height: "100%",
                ["--s" as string]: scaleOf(bar.height / 100),
                background: barColor(Math.round(bar.height)),
              }}
            />
            </button>
          ))}
        </span>
      </div>
      {energies.map((energy, index) => {
        if (index < page * PAGE_SIZE || index >= page * PAGE_SIZE + PAGE_SIZE || index >= cursor) return null;
        const cached = false;
        const line = lines[index] ?? "";
        const shown = Number(energy.toFixed(2));
        return (
          <div
            key={index}
            className={freshIndex === index ? "reel-shimmer relative" : "relative"}
            style={{ height: index < cursor ? (heights[index] ?? 22) : 22 }}
          >
            <button
              type="button"
              className="flex h-full w-full items-center justify-end gap-1.5 pr-2"
              aria-label={`Línea ${index + 1}, atención ${Math.round(shown)}`}
              onMouseEnter={(event) =>
                setTip({
                  x: event.clientX,
                  y: event.clientY,
                  title: `Línea ${index + 1} · ${Math.round(shown)}`,
                  body: line,
                })
              }
              onMouseLeave={() => setTip(null)}
            >
              <span className="hidden w-8 text-right text-[10px] text-[#ff6a3c] tabular-nums sm:inline">
                {hot.has(index) ? stamp(index, line) : ""}
              </span>
              <Sticks seed={line || String(index)} energy={shown} cached={cached} />
            </button>
          </div>
        );
      })}
      {tip ? (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded border border-white/10 bg-black/95 px-3 py-2 text-xs text-white/75"
          style={{ left: tip.x + 14, top: tip.y + 12 }}
        >
          <div className="mb-1 text-[10px] tracking-wide text-white/40 uppercase">{tip.title}</div>
          {tip.body}
        </div>
      ) : null}
    </div>
  );
}

function Sticks({ seed, energy, cached }: { seed: string; energy: number; cached: boolean }) {
  const profile = sparkProfile(cached ? `${seed}:cache` : seed, 11);
  return (
    <span className="flex h-4 w-[34px] items-end gap-px" aria-hidden>
      {profile.map((value, index) => {
        const scale = cached ? 0.2 + value * 0.25 : 0.12 + value * (0.18 + energy / 130);
        const amount = Math.round(value * energy);
        return (
          <span key={index} className="relative h-full w-[2px]">
            <span
              className="bar-fill absolute inset-x-0 bottom-0 rounded-[1px]"
              style={{
                height: "100%",
                ["--s" as string]: scaleOf(scale),
                background: cached ? "#6a6a6a" : stickColor(amount),
                ...(cached ? { opacity: 0.35 } : null),
                ...(!cached && amount > 62 ? { boxShadow: "0 0 6px rgba(255,70,40,0.7)" } : null),
              }}
            />
          </span>
        );
      })}
    </span>
  );
}

function scaleOf(value: number) {
  return Math.max(0.08, Math.min(1, value)).toFixed(4);
}

function stickColor(amount: number): string {
  if (amount > 55) return "#ff3b2a";
  if (amount > 32) return "#ff6a32";
  if (amount > 16) return "#a84832";
  return "#3e3938";
}

function stamp(index: number, line: string) {
  const frac = (hashString(`${line}:t`) % 80) / 100;
  return (0.35 + index * 0.37 + frac).toFixed(2);
}

function topSourceBars(docs: SourceDoc[], factorValue: number): SourceBar[] {
  const raw = docs.flatMap((doc) =>
    doc.spans.map((span, index) => ({
      key: `${doc.id}-${index}`,
      docName: doc.name,
      span,
      raw: rawSpanScore(span, factorValue),
      height: 0,
    })),
  );
  const ranked = [...raw].sort((a, b) => b.raw - a.raw).slice(0, 6);
  const heights = normalizeP95(ranked.map((bar) => bar.raw));
  return ranked.map((bar, index) => ({ ...bar, height: heights[index] ?? 0 }));
}

function useDebounced(value: string, wait: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), wait);
    return () => window.clearTimeout(timeout);
  }, [value, wait]);
  return debounced;
}
