"use client";

import { useDesk } from "@/lib/store";
import { factorReadout, type Factor, type FactorId } from "@/lib/text";

const DOT: Record<FactorId, string> = {
  tono: "#ff4d3a",
  tension: "#ff8a3d",
  foco: "#f4f4f4",
};

export function Factors({ layout = "rail" }: { layout?: "rail" | "row" }) {
  const factors = useDesk((state) => state.factors);
  const activeFactor = useDesk((state) => state.activeFactor);
  const setActiveFactor = useDesk((state) => state.setActiveFactor);

  return (
    <div
      className={
        layout === "row"
          ? "flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2"
          : "flex flex-col items-start gap-3 px-4 pt-4"
      }
    >
      {factors.map((factor) => {
        const readout = factorReadout(factor);
        const active = factor.id === activeFactor;
        return (
          <button
            key={factor.id}
            type="button"
            aria-pressed={active}
            onClick={() => setActiveFactor(factor.id)}
            data-factor={factor.id}
            className={`flex items-baseline gap-2 text-left leading-none transition-opacity hover:opacity-100 ${
              layout === "row" ? "text-[11px]" : "text-[13px]"
            } ${active ? "opacity-100" : "opacity-60"}`}
          >
            <span
              data-factor-dot={factor.id}
              className="h-2 w-2 shrink-0 translate-y-px rounded-full border"
              style={{
                background: active ? DOT[factor.id] : "transparent",
                borderColor: DOT[factor.id],
                boxShadow: active ? `0 0 8px ${DOT[factor.id]}` : undefined,
              }}
            />
            <span>
              <span className="text-white/55">{factor.name}: </span>
              <span style={{ color: wordColor(factor) }}>{readout.word} </span>
              <span className="text-white/90">{readout.pct}%</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function wordColor(factor: Factor): string {
  if (Math.abs(factor.value) < 0.08) return "rgba(255,255,255,0.78)";
  if (factor.id === "tono") return factor.value < 0 ? "#f0b4c4" : "#a9bce4";
  if (factor.id === "tension") return factor.value < 0 ? "#f0c6cc" : "#ff5a3c";
  return factor.value < 0 ? "#ffb089" : "#f7f7f7";
}
