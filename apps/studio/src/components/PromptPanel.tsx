"use client";

import { useEffect, useMemo, useState } from "react";
import { type DeskSnapshot, isSnapshot, readLibrary, writeLibrary } from "@/lib/library";
import { composeBeat } from "@/lib/prompt";
import { useDesk } from "@/lib/store";

export function PromptPanel() {
  const lines = useDesk((state) => state.lines);
  const cursor = useDesk((state) => state.cursor);
  const boxes = useDesk((state) => state.boxes);
  const factors = useDesk((state) => state.factors);
  const activeFactor = useDesk((state) => state.activeFactor);
  const docs = useDesk((state) => state.docs);
  const variant = useDesk((state) => state.variant);
  const prompts = useDesk((state) => state.prompts);
  const writeTake = useDesk((state) => state.writeTake);
  const bumpVariant = useDesk((state) => state.bumpVariant);
  const applySnapshot = useDesk((state) => state.applySnapshot);
  const [library, setLibrary] = useState<DeskSnapshot[]>([]);
  const [name, setName] = useState("");

  const beat = useMemo(
    () => composeBeat({ lines, cursor, boxes, factors, docs, activeFactor, variant }),
    [activeFactor, boxes, cursor, docs, factors, lines, variant],
  );
  const cachedNext = cursor < lines.length ? lines[cursor] : null;
  const lastPrompt = cursor > 0 ? prompts[cursor - 1] : undefined;

  useEffect(() => {
    setLibrary(readLibrary());
  }, []);

  function snapshot(label: string): DeskSnapshot {
    const state = useDesk.getState();
    return {
      version: 1,
      name: label,
      savedAt: new Date().toISOString(),
      lines: state.lines.map((text, index) => ({
        text,
        origin: state.origins[index] ?? "muestra",
        prompt: state.prompts[index] ?? null,
      })),
      boxes: state.boxes,
      factors: state.factors,
      docs: state.docs,
      cursor: state.cursor,
      variant: state.variant,
      blocked: Object.keys(state.blocked).map(Number),
    };
  }

  function save() {
    const label = name.trim() || defaultName(beat.attention[0]?.text);
    const next = [snapshot(label), ...library].slice(0, 24);
    writeLibrary(next);
    setLibrary(next);
    setName("");
  }

  function remove(savedAt: string) {
    const next = library.filter((entry) => entry.savedAt !== savedAt);
    writeLibrary(next);
    setLibrary(next);
  }

  function download() {
    const blob = new Blob([JSON.stringify(snapshot(name.trim() || defaultName(beat.attention[0]?.text)), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "maestro-toma.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 pt-4 pb-28">
      <div>
        <h2 className="text-[11px] tracking-wide text-white/45 uppercase">Prompt interno</h2>
        <p className="mt-1 text-[11px] leading-4 text-white/35">
          Esto es lo que se mandaría al modelo para la próxima oración. Las frases fijadas entran en Atención.
        </p>
      </div>
      <pre className="mono max-h-64 overflow-auto rounded border border-white/10 bg-black px-3 py-2 text-[11px] leading-5 whitespace-pre-wrap text-white/70">
        {beat.rendered}
      </pre>
      <div>
        <h3 className="text-[11px] tracking-wide text-[#ff8a5a] uppercase">Lo que seguiría</h3>
        <p className="mt-1 text-[13px] leading-5 text-white/80">{beat.sentence}</p>
        {cachedNext ? (
          <p className="mt-2 text-[11px] leading-4 text-white/35">
            En caché, la línea {cursor + 1} ya dice: {cachedNext}
          </p>
        ) : (
          <p className="mt-2 text-[11px] leading-4 text-white/35">No hay caché adelante. Escribir agrega esta oración.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-full bg-white px-3 py-1 text-[11px] text-black" onClick={writeTake}>
          Escribir toma
        </button>
        <button
          type="button"
          className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/70"
          onClick={bumpVariant}
        >
          Otra variante
        </button>
      </div>
      {lastPrompt ? (
        <details className="text-[11px] text-white/45">
          <summary className="cursor-pointer">Prompt que escribió la línea {cursor}</summary>
          <pre className="mono mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-white/55">{lastPrompt}</pre>
        </details>
      ) : null}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={beat.attention[0]?.text ? `toma · ${beat.attention[0].text}` : "Nombre de la toma"}
          className="min-w-0 flex-1 rounded border border-white/10 bg-black px-2 py-1 text-[11px] text-white outline-none"
        />
        <button type="submit" className="rounded border border-white/15 px-2 py-1 text-[11px] text-white/70">
          Guardar
        </button>
      </form>
      <div className="flex gap-2">
        <button type="button" className="text-[11px] text-white/45 underline" onClick={download}>
          Descargar JSON
        </button>
        <label className="cursor-pointer text-[11px] text-white/45 underline">
          Abrir JSON
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then((raw) => {
                try {
                  const parsed = JSON.parse(raw) as unknown;
                  if (!isSnapshot(parsed)) return;
                  applySnapshot(parsed);
                } catch {
                  return;
                }
              });
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {library.length > 0 ? (
        <ul className="space-y-2">
          {library.map((entry) => (
            <li key={entry.savedAt} className="flex items-start justify-between gap-2 text-[11px]">
              <button type="button" className="text-left text-white/70" onClick={() => applySnapshot(entry)}>
                {entry.name}
              </button>
              <button type="button" className="text-white/30" onClick={() => remove(entry.savedAt)}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-white/30">Todavía no hay tomas guardadas en este navegador.</p>
      )}
    </div>
  );
}

function defaultName(phrase?: string) {
  const stamp = new Date().toLocaleString("es");
  return phrase ? `toma · ${phrase} · ${stamp}` : `toma · ${stamp}`;
}
