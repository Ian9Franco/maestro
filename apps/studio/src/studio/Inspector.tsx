"use client";

import { INSPIRATIONS, type InspirationId } from "@/narrative/style";
import type { PromptDraft, StyleWeight } from "@/narrative/types";

export function Inspector({
  started,
  preview,
  draft,
  influence,
  styleMix,
  onWeight,
  onInspiration,
}: {
  started: boolean;
  preview: string;
  draft: PromptDraft;
  influence: string[];
  styleMix: StyleWeight[];
  onWeight: (id: string, weight: number) => void;
  onInspiration: (id: InspirationId) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-white/50">{started ? "Seguiría desde el cursor." : "Empezaría de cero."}</p>
      <section className="rounded-lg border border-white/10 p-3">
        <h2 className="text-[11px] tracking-wide text-white/45 uppercase">Propuesta mock</h2>
        <p className="mt-2 text-sm leading-5 text-white/75">{preview}</p>
        <p className="mt-2 text-[11px] text-white/35">Sin modelo. Cambia con el cursor, las fichas y la inspiración.</p>
      </section>

      {influence.length > 0 ? (
        <section>
          <h2 className="text-[11px] tracking-wide text-white/45 uppercase">Influencia</h2>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            {influence.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="text-[11px] tracking-wide text-white/45 uppercase">Inspiración</h2>
        <div className="mt-2 flex flex-wrap gap-1">
          {INSPIRATIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-white/75"
              onClick={() => onInspiration(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
        <ul className="mt-3 space-y-2">
          {styleMix.map((trait) => (
            <li key={trait.id}>
              <label className="flex items-center justify-between text-[11px] text-white/55" htmlFor={`style-${trait.id}`}>
                {trait.name}
                <span className="tabular-nums text-white/80">{trait.weight}%</span>
              </label>
              <input
                id={`style-${trait.id}`}
                type="range"
                min={0}
                max={100}
                value={trait.weight}
                onChange={(event) => onWeight(trait.id, Number(event.target.value))}
                className="mt-1 w-full accent-white"
              />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-[11px] tracking-wide text-white/45 uppercase">Reciente</h2>
        <p className="mt-2 text-sm leading-5 text-white/70">
          {draft.recent ? excerpt(draft.recent.text) : "No hay texto antes del cursor."}
        </p>
      </section>

      <section>
        <h2 className="text-[11px] tracking-wide text-white/45 uppercase">Referencias</h2>
        {draft.references.length === 0 ? (
          <p className="mt-2 text-sm text-white/40">Ninguna ancla en este punto.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {draft.references.map((item) => (
              <li key={item.label} className="text-sm text-white/75">
                <span className="text-[11px] tracking-wide text-[#9eb7ff] uppercase">{item.label}</span>
                <span className="mt-1 block">{item.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {draft.excluded.length > 0 ? (
        <details className="text-sm text-white/50">
          <summary className="cursor-pointer text-[11px] tracking-wide uppercase">Fuera del contexto</summary>
          <ul className="mt-2 space-y-1">
            {draft.excluded.map((item) => (
              <li key={`${item.label}-${item.reason}`}>
                {item.label}. {item.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function excerpt(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 220) return clean;
  return `…${clean.slice(clean.length - 220)}`;
}
