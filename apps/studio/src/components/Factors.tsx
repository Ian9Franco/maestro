"use client";

import { useDesk } from "@/lib/store";
import { factorReadout, type FactorId } from "@/lib/text";

const DOT: Record<FactorId, string> = {
  tono: "#ff4d3a",
  tension: "#ff8a3d",
  foco: "#f4f4f4",
};

export function Factors() {
  const factors = useDesk((state) => state.factors);
  const activeFactor = useDesk((state) => state.activeFactor);
  const setActiveFactor = useDesk((state) => state.setActiveFactor);

  return (
    <div className="flex h-full flex-col justify-center gap-3 px-3">
      {factors.map((factor) => {
        const readout = factorReadout(factor);
        const active = factor.id === activeFactor;
        return (
          <button
            key={factor.id}
            type="button"
            onClick={() => setActiveFactor(factor.id)}
            className="w-full rounded-xl border bg-black/70 px-4 py-3 text-left shadow-lg transition duration-150 hover:scale-105"
            style={{
              borderColor: active ? "rgba(255,70,50,0.85)" : "rgba(255,255,255,0.12)",
              boxShadow: active ? "0 0 18px rgba(255,60,40,0.25)" : undefined,
            }}
          >
            <div className="flex items-center gap-2 text-sm text-white/90">
              <span className="h-2 w-2 rounded-full" style={{ background: DOT[factor.id] }} />
              <span>
                {factor.name}: {readout.word}
              </span>
            </div>
            <div className="mt-1 pl-4 text-2xl font-medium tracking-tight text-white">
              {readout.pct}%
            </div>
          </button>
        );
      })}
    </div>
  );
}
