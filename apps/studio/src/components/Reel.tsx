"use client";

import { useEffect, useMemo, useState } from "react";
import { useDesk } from "@/lib/store";
import {
  type AttentionBox,
  barColor,
  normalizeP95,
  rawLineScore,
  rawSpanScore,
  type SourceDoc,
} from "@/lib/text";

const REEL_HINT =
  "Muestra qué partes de tu historia influyen más en la próxima generación. Arrastra las cajas para cambiar el foco.";

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

  const lineHeights = useMemo(() => {
    const raw = lines
      .slice(0, parsed.revealed)
      .map((line, index) => rawLineScore(line, index, parsed.boxes, parsed.factorValue));
    return normalizeP95(raw).map((score) => 24 + score * 0.76);
  }, [lines, parsed]);

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
    <div className="w-[76px] shrink-0" title={REEL_HINT} aria-label={REEL_HINT}>
      <div className="flex h-16 items-end gap-1 px-2 pb-2">
        {sourceBars.map((bar) => (
          <button
            key={bar.key}
            type="button"
            className="relative h-12 w-2 rounded-sm bg-white/5"
            onMouseEnter={(event) =>
              setTip({
                x: event.clientX,
                y: event.clientY,
                title: bar.docName,
                body: bar.span,
              })
            }
            onMouseLeave={() => setTip(null)}
          >
            <Bar percent={bar.height} cached={false} />
          </button>
        ))}
      </div>
      <div className={freshIndex !== null ? "reel-shimmer" : undefined}>
        {lineHeights.map((percent, index) => (
          <div
            key={index}
            className="flex items-center justify-center"
            style={{ height: heights[index] ?? 36 }}
          >
            <button
              type="button"
              className="relative h-[70%] w-2.5 rounded-sm bg-white/5"
              onMouseEnter={(event) =>
                setTip({
                  x: event.clientX,
                  y: event.clientY,
                  title: `Línea ${index + 1} · ${Math.round(percent)}`,
                  body: lines[index] ?? "",
                })
              }
              onMouseLeave={() => setTip(null)}
            >
              <Bar percent={percent} cached={index >= cursor} />
            </button>
          </div>
        ))}
      </div>
      {tip ? (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-md border border-white/10 bg-black/90 px-3 py-2 text-xs text-white/80 shadow-lg"
          style={{ left: tip.x + 16, top: tip.y + 12 }}
        >
          <div className="mb-1 text-[10px] uppercase tracking-wide text-white/45">{tip.title}</div>
          {tip.body}
        </div>
      ) : null}
    </div>
  );
}

function Bar({ percent, cached }: { percent: number; cached: boolean }) {
  const scale = Math.max(0.04, percent / 100);
  return (
    <span
      className="bar-fill absolute inset-x-0 bottom-0 rounded-sm"
      style={{
        ["--s" as string]: scale,
        height: "100%",
        background: cached ? "#8a8a8a" : barColor(percent),
        opacity: cached ? 0.3 : 1,
        boxShadow: !cached && percent > 70 ? "0 0 8px rgba(255, 90, 50, 0.55)" : undefined,
      }}
    />
  );
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
