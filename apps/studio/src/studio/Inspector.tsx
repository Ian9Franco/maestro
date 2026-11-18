"use client";

import { EMOTIONS } from "@/narrative/emotion";
import { INSPIRATIONS, type InspirationId } from "@/narrative/style";
import type { GenerationRecord, PromptDraft, StyleWeight } from "@/narrative/types";
import { estimateTokens, WORDS_PER_LINE, type WrittenSentence } from "@/narrative/writer";

const heading = "text-[11px] tracking-wide text-white/45 uppercase";

export function Inspector({
  started,
  crafting,
  dragging,
  lines,
  sentences,
  draft,
  prompt,
  history,
  influence,
  styleMix,
  onWeight,
  onInspiration,
}: {
  started: boolean;
  crafting: boolean;
  dragging: boolean;
  lines: number;
  sentences: WrittenSentence[];
  draft: PromptDraft;
  prompt: string;
  history: GenerationRecord[];
  influence: string[];
  styleMix: StyleWeight[];
  onWeight: (id: string, weight: number) => void;
  onInspiration: (id: InspirationId) => void;
}) {
  const accepted = history.filter((item) => item.status === "accepted").length;
  const discarded = history.filter((item) => item.status === "discarded").length;
  return (
    <div className="space-y-4">
      <p className="text-xs text-white/50">
        {crafting ? "Modo contexto: no hay propuesta. Estás eligiendo qué recordar." : started ? "Seguiría desde el cursor." : "Empezaría de cero."}
      </p>
      {crafting ? null : <section className="rounded-lg border border-white/10 p-3" aria-live="polite">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className={heading}>Propuesta mock</h2>
          <span className="text-[11px] tabular-nums text-white/40">
            {dragging ? "arrastrando · " : ""}
            {lines} {lines === 1 ? "renglón" : "renglones"} · ≈{lines * WORDS_PER_LINE} palabras
          </span>
        </div>
        {sentences.length === 0 ? (
          <p className="mt-2 text-sm text-white/40">La escena mock no tiene más pasos desde acá.</p>
        ) : (
          <ol className="mt-2 space-y-1.5 text-sm leading-5 text-white/75">
            {sentences.map((sentence) => (
              <li key={sentence.text}>
                {sentence.text}
                {sentence.reference ? <Tag tone="#9eb7ff">por referencia</Tag> : null}
                {sentence.recycled ? <Tag tone="#ffb38a">idea reciclada</Tag> : null}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-2 text-[11px] text-white/35">
          Sin modelo. Cambia con el cursor, las fichas, las referencias y la inspiración.
        </p>
      </section>}

      <section>
        <h2 className={heading}>Historial</h2>
        <p className="mt-1 text-sm text-white/60">
          {accepted} {accepted === 1 ? "tramo generado" : "tramos generados"} · {discarded}{" "}
          {discarded === 1 ? "descartado" : "descartados"}
        </p>
        {discarded > 0 ? (
          <p className="mt-1 text-[11px] text-white/40">Lo descartado no vuelve igual: la próxima toma usa otra redacción.</p>
        ) : null}
      </section>

      <section>
        <h2 className={heading}>Referencias conectadas</h2>
        {draft.references.length === 0 ? (
          <p className="mt-2 text-sm text-white/40">Ninguna. Doble clic en una palabra para conectarla al cursor.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {draft.references.map((item) => (
              <li key={`${item.label}-${item.text}`} className="text-sm text-white/75">
                <span className="text-[11px] tracking-wide text-[#9eb7ff] uppercase">{item.label}</span>
                <span className="mt-1 block">{item.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {influence.length > 0 ? (
        <section>
          <h2 className={heading}>Influencia</h2>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            {influence.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className={heading}>Emoción de la columna</h2>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {EMOTIONS.map((emotion) => (
            <li key={emotion.id} className="flex items-center gap-1 text-[11px] text-white/60">
              <i className="inline-block h-1.5 w-3 rounded-full" style={{ background: emotion.color }} />
              {emotion.name}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className={heading}>Inspiración</h2>
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

      <details className="text-sm">
        <summary className={`${heading} cursor-pointer`}>
          Prompt al modelo · ≈{estimateTokens(prompt)} tokens
        </summary>
        <pre className="mt-2 max-h-80 overflow-auto rounded-md border border-white/10 bg-white/[0.03] p-2 text-[11px] leading-4 whitespace-pre-wrap text-white/65">
          {prompt}
        </pre>
      </details>

      {draft.excluded.length > 0 ? (
        <details className="text-sm text-white/50">
          <summary className={`${heading} cursor-pointer`}>Fuera del contexto</summary>
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

function Tag({ tone, children }: { tone: string; children: string }) {
  return (
    <span className="ml-1.5 rounded px-1 text-[10px] tracking-wide uppercase" style={{ color: tone, border: `1px solid ${tone}55` }}>
      {children}
    </span>
  );
}
