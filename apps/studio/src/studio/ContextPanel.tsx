"use client";

import { useId, useState, type FormEvent } from "react";
import type { ContextDocument, ContextKind, ProjectSummary } from "@/narrative/types";

const KINDS: { id: ContextKind; label: string }[] = [
  { id: "personaje", label: "Personaje" },
  { id: "saga", label: "Saga" },
  { id: "lore", label: "Lore" },
  { id: "notas", label: "Notas" },
];

export function ContextPanel({
  name,
  format,
  style,
  docs,
  projects,
  projectId,
  saveLabel,
  onName,
  onFormat,
  onStyle,
  onDocs,
  onOpen,
  onCreate,
  onDelete,
}: {
  name: string;
  format: string;
  style: string;
  docs: ContextDocument[];
  projects: ProjectSummary[];
  projectId: string;
  saveLabel: string;
  onName: (value: string) => void;
  onFormat: (value: string) => void;
  onStyle: (value: string) => void;
  onDocs: (docs: ContextDocument[]) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: () => void;
}) {
  const baseId = useId();
  const [docName, setDocName] = useState("");
  const [kind, setKind] = useState<ContextKind>("personaje");
  const [body, setBody] = useState("");

  function addDoc(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    onDocs([
      ...docs,
      {
        id: crypto.randomUUID(),
        name: docName.trim() || "Sin título",
        kind,
        body: text,
        included: true,
        protected: kind !== "notas",
      },
    ]);
    setDocName("");
    setBody("");
  }

  return (
    <aside className="flex h-full min-h-0 flex-col gap-5 overflow-auto border-white/10 px-4 py-4 md:border-l" aria-label="Contexto del proyecto">
      <div className="flex items-center justify-between gap-3">
        <label className="min-w-0 flex-1 text-[11px] tracking-wide text-white/45 uppercase" htmlFor={`${baseId}-project`}>
          Proyecto
          <select
            id={`${baseId}-project`}
            value={projectId}
            onChange={(event) => onOpen(event.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-black px-2 py-1.5 text-sm tracking-normal text-white normal-case"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <span className="pt-4 text-[11px] text-white/40" aria-live="polite">
          {saveLabel}
        </span>
      </div>
      <div className="flex gap-2">
        <button type="button" className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/80" onClick={onCreate}>
          Nuevo
        </button>
        <button type="button" className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/50" onClick={onDelete}>
          Borrar
        </button>
      </div>

      <Field id={`${baseId}-name`} label="Título" value={name} onChange={onName} />
      <Field
        id={`${baseId}-format`}
        label="Formato"
        value={format}
        onChange={onFormat}
        multiline
        placeholder="Prosa corrida, capítulos cortos, tiempo presente."
      />
      <Field
        id={`${baseId}-style`}
        label="Estilo"
        value={style}
        onChange={onStyle}
        multiline
        placeholder="Sobrio, sensorial, sin explicar de más."
      />

      <form className="space-y-2 border-t border-white/10 pt-4" onSubmit={addDoc}>
        <h2 className="text-[11px] tracking-wide text-white/45 uppercase">Documentos</h2>
        <Field id={`${baseId}-doc-name`} label="Nombre" value={docName} onChange={setDocName} />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Tipo de documento">
          {KINDS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={kind === item.id}
              onClick={() => setKind(item.id)}
              className="rounded-full border border-white/15 px-2.5 py-1 text-xs"
              style={{
                background: kind === item.id ? "rgba(255,255,255,0.16)" : "transparent",
                color: kind === item.id ? "white" : "rgba(255,255,255,0.55)",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Lo que este documento tiene que recordar."
          rows={4}
          aria-label="Texto del documento"
          className="w-full resize-y rounded-md border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-white/30"
        />
        <button type="submit" className="rounded-md bg-white px-3 py-1.5 text-sm text-black">
          Agregar
        </button>
      </form>

      {docs.length === 0 ? <p className="text-sm text-white/40">Todavía no hay fichas.</p> : null}
      <ul className="space-y-3">
        {docs.map((doc) => (
          <li key={doc.id}>
            <DocCard
              doc={doc}
              onChange={(next) => onDocs(docs.map((item) => (item.id === doc.id ? next : item)))}
              onRemove={() => onDocs(docs.filter((item) => item.id !== doc.id))}
            />
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const className =
    "mt-1 w-full rounded-md border border-white/10 bg-black px-3 py-2 text-sm tracking-normal text-white normal-case outline-none focus:border-white/30";
  return (
    <label className="block text-[11px] tracking-wide text-white/45 uppercase" htmlFor={id}>
      {label}
      {multiline ? (
        <textarea id={id} value={value} placeholder={placeholder} rows={3} onChange={(event) => onChange(event.target.value)} className={`${className} resize-y`} />
      ) : (
        <input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={className} />
      )}
    </label>
  );
}

function DocCard({
  doc,
  onChange,
  onRemove,
}: {
  doc: ContextDocument;
  onChange: (doc: ContextDocument) => void;
  onRemove: () => void;
}) {
  const baseId = useId();
  return (
    <article className="space-y-2 rounded-lg border border-white/10 p-3">
      <div className="flex items-start justify-between gap-2">
        <label className="min-w-0 flex-1 text-[11px] text-white/45" htmlFor={`${baseId}-name`}>
          Nombre
          <input
            id={`${baseId}-name`}
            value={doc.name}
            onChange={(event) => onChange({ ...doc, name: event.target.value })}
            className="mt-1 w-full rounded-md border border-white/10 bg-black px-2 py-1 text-sm text-white outline-none"
          />
        </label>
        <button type="button" className="pt-5 text-[11px] text-white/40" onClick={onRemove}>
          Quitar
        </button>
      </div>
      <label className="block text-[11px] text-white/45" htmlFor={`${baseId}-kind`}>
        Tipo
        <select
          id={`${baseId}-kind`}
          value={doc.kind}
          onChange={(event) => onChange({ ...doc, kind: event.target.value as ContextKind })}
          className="mt-1 w-full rounded-md border border-white/10 bg-black px-2 py-1 text-sm text-white"
        >
          {KINDS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <textarea
        value={doc.body}
        aria-label={`Texto de ${doc.name}`}
        rows={4}
        onChange={(event) => onChange({ ...doc, body: event.target.value })}
        className="w-full resize-y rounded-md border border-white/10 bg-black px-2 py-1 text-sm text-white outline-none"
      />
      <label className="flex items-center gap-2 text-xs text-white/70">
        <input type="checkbox" checked={doc.included} onChange={(event) => onChange({ ...doc, included: event.target.checked })} />
        Incluido en el contexto
      </label>
      <label className="flex items-center gap-2 text-xs text-white/70">
        <input
          type="checkbox"
          checked={doc.protected}
          onChange={(event) => onChange({ ...doc, protected: event.target.checked })}
        />
        Protegido cuando el contexto no alcance
      </label>
    </article>
  );
}
