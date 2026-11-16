"use client";

import { useState } from "react";
import { useDesk } from "@/lib/store";
import { type DocKind } from "@/lib/text";

const KINDS: { id: DocKind; label: string }[] = [
  { id: "personaje", label: "Personaje" },
  { id: "saga", label: "Saga" },
  { id: "lore", label: "Lore" },
  { id: "notas", label: "Notas" },
];

export function ContextDrawer() {
  const open = useDesk((state) => state.drawerOpen);
  const docs = useDesk((state) => state.docs);
  const addDoc = useDesk((state) => state.addDoc);
  const removeDoc = useDesk((state) => state.removeDoc);
  const setDrawerOpen = useDesk((state) => state.setDrawerOpen);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DocKind>("personaje");
  const [text, setText] = useState("");
  const [openId, setOpenId] = useState<string | null>(docs[0]?.id ?? null);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar contexto"
        className="fixed inset-0 z-40 bg-black/70 md:hidden"
        onClick={() => setDrawerOpen(false)}
      />
      <aside className="fixed inset-x-0 top-0 bottom-0 z-50 flex w-full flex-col bg-black/98 pt-[env(safe-area-inset-top,0px)] shadow-2xl md:absolute md:inset-auto md:top-0 md:right-0 md:bottom-7 md:w-[min(100%,380px)] md:border-l md:border-white/10 md:pt-0">
      <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm text-white">Contexto</h2>
          <p className="mt-1 text-xs leading-5 text-white/50">
            Pegá fichas, sagas o lore. Maestro los parte en spans. Todavía no se envían a un modelo.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-sm text-white/70 transition hover:scale-105 hover:bg-white/10"
          onClick={() => setDrawerOpen(false)}
        >
          Cerrar
        </button>
      </header>

      <form
        className="space-y-3 border-b border-white/10 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          addDoc(name, kind, text);
          setName("");
          setText("");
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nombre"
          className="w-full rounded-md border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-white/30"
        />
        <div className="flex flex-wrap gap-1">
          {KINDS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setKind(item.id)}
              className="rounded-full px-2.5 py-1 text-xs transition hover:scale-105"
              style={{
                background: kind === item.id ? "rgba(255,255,255,0.16)" : "transparent",
                color: kind === item.id ? "white" : "rgba(255,255,255,0.55)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Pegá el documento…"
          rows={5}
          className="mono w-full resize-none rounded-md border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-white/30"
        />
        <div
          className="rounded-md border border-dashed border-white/15 px-3 py-3 text-center text-xs text-white/45"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void readFiles(event.dataTransfer.files, kind, addDoc);
          }}
        >
          O soltá un .txt o .md
        </div>
        <button
          type="submit"
          className="rounded-md bg-white px-3 py-1.5 text-sm text-black transition hover:scale-105"
        >
          Agregar
        </button>
      </form>

      <div className="flex-1 space-y-2 overflow-auto px-4 py-3">
        {docs.length === 0 ? (
          <p className="text-sm text-white/40">Todavía no hay documentos.</p>
        ) : null}
        {docs.map((doc) => (
          <article key={doc.id} className="rounded-lg border border-white/10">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
              onClick={() => setOpenId((current) => (current === doc.id ? null : doc.id))}
            >
              <span>
                <span className="mr-2 text-[10px] uppercase tracking-wide text-white/40">
                  {KINDS.find((item) => item.id === doc.kind)?.label}
                </span>
                <span className="text-sm text-white">{doc.name}</span>
              </span>
              <span className="text-xs text-white/40">{doc.spans.length} spans</span>
            </button>
            {openId === doc.id ? (
              <div className="space-y-2 border-t border-white/10 px-3 py-2">
                {doc.spans.map((span, index) => (
                  <p key={index} className="mono text-xs leading-5 text-white/70">
                    {span}
                  </p>
                ))}
                <button
                  type="button"
                  className="text-xs text-red-300/80"
                  onClick={() => removeDoc(doc.id)}
                >
                  Quitar documento
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </aside>
    </>
  );
}

async function readFiles(
  files: FileList,
  kind: DocKind,
  addDoc: (name: string, kind: DocKind, text: string) => void,
) {
  for (const file of files) {
    if (file.size > 1_000_000) continue;
    const text = await file.text();
    addDoc(file.name.replace(/\.(txt|md)$/i, ""), kind, text);
  }
}
