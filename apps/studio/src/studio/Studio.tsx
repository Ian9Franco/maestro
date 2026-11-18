"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { documentFromJSON, readReferences, referenceConnected } from "@/narrative/document";
import {
  blankDemo,
  continuedDemo,
  DEMO_BLANK_ID,
  DEMO_CONTINUED_ID,
  isEmptyStory,
  RETIRED_DEMO_IDS,
} from "@/narrative/demo";
import { createIdbRepository } from "@/narrative/idb-repository";
import { assemblePrompt, renderPrompt } from "@/narrative/prompt";
import { toSummary, type NarrativeRepository } from "@/narrative/repository";
import { describeStyle, INSPIRATIONS, mixFromWeights, type InspirationId } from "@/narrative/style";
import type { ContextDocument, GenerationRecord, ProjectRecord, ProjectSummary } from "@/narrative/types";
import { type NarrativeDials } from "@/narrative/dials";
import { joinSentences, MAX_LINES, PREVIEW_LINES, splitSentences, WORDS_PER_LINE, writeSentences } from "@/narrative/writer";
import { ContextPanel } from "@/studio/ContextPanel";
import { Inspector } from "@/studio/Inspector";
import type { Discarded, GeneratedBlock } from "@/studio/NarrativeEditor";

const NarrativeEditor = dynamic(
  () => import("@/studio/NarrativeEditor").then((mod) => mod.NarrativeEditor),
  {
    ssr: false,
    loading: () => <p className="text-sm text-white/40">Abriendo el editor…</p>,
  },
);

async function seedDemos(repository: NarrativeRepository) {
  for (const id of RETIRED_DEMO_IDS) {
    if (await repository.getProject(id)) await repository.deleteProject(id);
  }
  if (!(await repository.getProject(DEMO_BLANK_ID))) await repository.saveProject(blankDemo());
  if (!(await repository.getProject(DEMO_CONTINUED_ID))) await repository.saveProject(continuedDemo());
}

export function Studio() {
  const repository = useMemo(() => createIdbRepository(), []);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [generations, setGenerations] = useState<GenerationRecord[]>([]);
  const [dragLines, setDragLines] = useState<number | null>(null);
  const [mood, setMood] = useState<"generar" | "contexto">("generar");
  const [saveLabel, setSaveLabel] = useState("Guardado");
  const [error, setError] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const projectRef = useRef<ProjectRecord | null>(null);
  const timer = useRef<number | null>(null);
  const saveSeq = useRef(0);
  /** Generar o descartar es un evento, no tipeo: el documento se guarda enseguida. */
  const urgent = useRef(false);
  projectRef.current = project;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await seedDemos(repository);
      if (cancelled) return;
      const list = await repository.listProjects();
      const own = list.filter((item) => item.id !== DEMO_BLANK_ID && item.id !== DEMO_CONTINUED_ID);
      const only = own.length === 1 ? await repository.getProject(own[0]!.id) : null;
      const untouched =
        own.length === 0 ||
        (only !== null && only.name === "Sin título" && only.contextDocs.length === 0 && isEmptyStory(only.document));
      const openId = untouched ? DEMO_CONTINUED_ID : (list[0]?.id ?? DEMO_CONTINUED_ID);
      const current = await repository.getProject(openId);
      const history = current ? await repository.listGenerations(current.id) : [];
      if (cancelled || !current) return;
      setProjects(list);
      setProject(current);
      setGenerations(history);
    })().catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "No se pudo abrir el archivo local.");
    });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  useEffect(() => {
    const save = () => {
      const current = projectRef.current;
      if (!current) return;
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      void repository.saveProject(current);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", save);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [repository]);

  const discarded = useMemo(
    () => generations.filter((item) => item.status === "discarded").flatMap((item) => splitSentences(item.output)),
    [generations],
  );

  const scene = useMemo(() => {
    if (!project) return null;
    try {
      const doc = documentFromJSON(project.document);
      const cursor = Math.max(0, Math.min(project.cursor ?? 1, doc.content.size));
      const draft = assemblePrompt(doc, cursor, project.format, project.style, project.contextDocs);
      const references = readReferences(doc)
        .filter((reference) => referenceConnected(doc, cursor, reference))
        .map((reference) => ({ text: reference.text, intent: reference.intent }));
      const base = {
        before: doc.textBetween(0, cursor, " ", " "),
        whole: doc.textBetween(0, doc.content.size, " ", " "),
        names: draft.contextDocs.map((item) => item.label),
        weights: project.styleMix,
        dials: project.dials,
        references,
        discarded,
      };
      const write = (lines: number) => writeSentences({ ...base, lines });
      const sentences = write(MAX_LINES);
      return { draft, write, sentences, preview: joinSentences(sentences) };
    } catch {
      return null;
    }
  }, [project, discarded, dragLines]);

  function remember(next: ProjectRecord) {
    projectRef.current = next;
    setProject(next);
    setProjects((current) => {
      const summary = toSummary(next);
      const rest = current.filter((item) => item.id !== next.id);
      return [summary, ...rest];
    });
  }

  async function show(next: ProjectRecord) {
    remember(next);
    setGenerations(await repository.listGenerations(next.id));
    setDragLines(null);
  }

  function queueSave(next: ProjectRecord) {
    const seq = saveSeq.current + 1;
    saveSeq.current = seq;
    setSaveLabel("Guardando…");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void repository.saveProject(next).then(() => {
        if (saveSeq.current === seq) setSaveLabel("Guardado");
      });
    }, 400);
  }

  async function flush() {
    const current = projectRef.current;
    if (!current) return;
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    await repository.saveProject(current);
    setSaveLabel("Guardado");
  }

  function commit(next: ProjectRecord, when: "now" | "soon") {
    remember(next);
    if (when === "now") {
      const seq = saveSeq.current + 1;
      saveSeq.current = seq;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      setSaveLabel("Guardando…");
      void repository.saveProject(next).then(() => {
        if (saveSeq.current === seq) setSaveLabel("Guardado");
      });
      return;
    }
    queueSave(next);
  }

  function patch(
    partial: Partial<Pick<ProjectRecord, "name" | "format" | "style" | "styleMix" | "contextDocs" | "dials">>,
    when: "now" | "soon",
  ) {
    const current = projectRef.current;
    if (!current) return;
    commit({ ...current, ...partial, updatedAt: new Date().toISOString() }, when);
  }

  function onDocument(document: JSONContent) {
    const current = projectRef.current;
    if (!current) return;
    const when = urgent.current ? "now" : "soon";
    urgent.current = false;
    commit({ ...current, document, updatedAt: new Date().toISOString() }, when);
  }

  function onCursor(cursor: number) {
    const current = projectRef.current;
    if (!current || current.cursor === cursor) return;
    commit({ ...current, cursor, updatedAt: new Date().toISOString() }, "soon");
  }

  function record(entry: Omit<GenerationRecord, "projectId" | "createdAt" | "model" | "prompt">) {
    const current = projectRef.current;
    if (!current || !scene) return;
    urgent.current = true;
    const full: GenerationRecord = {
      ...entry,
      projectId: current.id,
      prompt: scene.draft,
      model: null,
      createdAt: new Date().toISOString(),
    };
    setGenerations((list) => [...list, full]);
    void repository.appendGeneration(full);
  }

  function onGenerate(lines: number): GeneratedBlock | null {
    if (!scene) return null;
    const sentences = scene.write(lines);
    if (sentences.length === 0) return null;
    const text = joinSentences(sentences);
    const block = { text, blockId: crypto.randomUUID(), generationId: crypto.randomUUID() };
    const lastDiscard = [...generations].reverse().find((item) => item.status === "discarded");
    record({
      id: block.generationId,
      blockId: block.blockId,
      parentId: sentences.some((item) => item.recycled) ? (lastDiscard?.id ?? null) : null,
      output: text,
      params: { maxWords: lines * WORDS_PER_LINE },
      status: "accepted",
    });
    return block;
  }

  function onDiscard(gone: Discarded) {
    const first = gone.ids[0];
    record({
      id: crypto.randomUUID(),
      blockId: first?.blockId ?? "sin-bloque",
      parentId: first?.generationId || null,
      output: gone.text,
      params: { maxWords: 0 },
      status: "discarded",
    });
  }

  function onDials(dials: NarrativeDials) {
    patch({ dials }, "soon");
  }

  function onWeight(id: string, weight: number) {
    const current = projectRef.current;
    if (!current) return;
    const styleMix = current.styleMix.map((trait) => (trait.id === id ? { ...trait, weight } : trait));
    patch({ styleMix, style: describeStyle(styleMix) }, "now");
  }

  function onInspiration(id: InspirationId) {
    const preset = INSPIRATIONS.find((item) => item.id === id);
    if (!preset) return;
    const styleMix = mixFromWeights(preset.weights);
    patch({ styleMix, style: describeStyle(styleMix) }, "now");
  }

  async function openProject(id: string) {
    if (id === projectRef.current?.id) return;
    await flush();
    const next = await repository.getProject(id);
    if (!next) return;
    const opened = { ...next, updatedAt: new Date().toISOString() };
    await show(opened);
    await repository.saveProject(opened);
    setSaveLabel("Guardado");
    setContextOpen(false);
  }

  async function createProject() {
    await flush();
    const next = await repository.createProject("Sin título");
    await show(next);
    setSaveLabel("Guardado");
  }

  async function deleteProject() {
    const current = projectRef.current;
    if (!current) return;
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    await repository.deleteProject(current.id);
    await seedDemos(repository);
    const list = await repository.listProjects();
    const next = await repository.getProject(list[0]?.id ?? DEMO_CONTINUED_ID);
    setProjects(list);
    if (next) await show(next);
    setSaveLabel("Guardado");
  }

  if (error) {
    return <p className="px-6 py-10 text-sm text-white/70">{error}</p>;
  }

  if (!project || !scene) {
    return <p className="px-6 py-10 text-sm text-white/40">Abriendo el proyecto…</p>;
  }

  return (
    <main className="md:grid md:h-dvh md:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="min-h-screen md:h-dvh md:min-h-0 md:overflow-auto">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-sm md:hidden">
          <p className="min-w-0 flex-1 truncate text-sm text-white">{project.name}</p>
          <button
            type="button"
            className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/80"
            aria-expanded={contextOpen}
            onClick={() => setContextOpen((open) => !open)}
          >
            Contexto
          </button>
        </header>
        <div className="mx-auto w-full max-w-[44rem] px-3 py-8 sm:px-5">
          <ul className="mb-4 space-y-1 pl-24 text-xs text-white/40">
            <li>Generar: arrastrá el texto gris, o los renglones de abajo, hasta la oración que quieras. Tab acepta dos.</li>
            <li>Un clic mueve el punto: ahí se escribe a mano y de ahí sigue la generación.</li>
            <li>Clic en el punto abre el modo. Arrastralo hacia tensión, sorpresa, ritmo o distancia para subir o bajar esa característica.</li>
            <li>Arrastrar sobre texto generado lo borra al paso.</li>
            <li>Contexto: doble clic marca una palabra y esconde la propuesta. Otro clic elige, el siguiente marca.</li>
          </ul>
          <NarrativeEditor
            key={project.id}
            projectId={project.id}
            initial={project.document}
            initialCursor={project.cursor}
            placeAtEnd={project.cursor == null && project.id === DEMO_CONTINUED_ID}
            preview={scene.preview}
            onChange={onDocument}
            onCursor={onCursor}
            onDragLines={setDragLines}
            onGenerate={onGenerate}
            onDiscard={onDiscard}
            onMood={setMood}
            dials={project.dials}
            onDials={onDials}
          />
        </div>
      </section>
      <div className={`${contextOpen ? "block" : "hidden"} h-dvh md:block`}>
        <ContextPanel
          name={project.name}
          format={project.format}
          docs={project.contextDocs}
          projects={projects}
          projectId={project.id}
          saveLabel={saveLabel}
          inspector={
            <Inspector
              started={scene.draft.recent !== null}
              crafting={mood === "contexto"}
              dragging={dragLines !== null}
              lines={dragLines ?? PREVIEW_LINES}
              sentences={scene.sentences}
              draft={scene.draft}
              prompt={renderPrompt(scene.draft)}
              history={generations}
              influence={project.influence}
              dials={project.dials}
              styleMix={project.styleMix}
              onWeight={onWeight}
              onInspiration={onInspiration}
            />
          }
          onName={(name) => patch({ name }, "now")}
          onFormat={(format) => patch({ format }, "now")}
          onDocs={(contextDocs: ContextDocument[]) => patch({ contextDocs }, "now")}
          onOpen={(id) => void openProject(id)}
          onCreate={() => void createProject()}
          onDelete={() => void deleteProject()}
        />
      </div>
    </main>
  );
}
