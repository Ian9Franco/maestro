"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { documentFromJSON } from "@/narrative/document";
import { blankDemo, continuedDemo, DEMO_CONTINUED_ID, DEMO_BLANK_ID, isEmptyStory, mockContinuation } from "@/narrative/demo";
import { createIdbRepository } from "@/narrative/idb-repository";
import { assemblePrompt } from "@/narrative/prompt";
import { toSummary } from "@/narrative/repository";
import { describeStyle, INSPIRATIONS, mixFromWeights, type InspirationId } from "@/narrative/style";
import type { ContextDocument, ProjectRecord, ProjectSummary } from "@/narrative/types";
import { ContextPanel } from "@/studio/ContextPanel";
import { Inspector } from "@/studio/Inspector";

const NarrativeEditor = dynamic(
  () => import("@/studio/NarrativeEditor").then((mod) => mod.NarrativeEditor),
  {
    ssr: false,
    loading: () => <p className="text-sm text-white/40">Abriendo el editor…</p>,
  },
);

export function Studio() {
  const repository = useMemo(() => createIdbRepository(), []);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [saveLabel, setSaveLabel] = useState("Guardado");
  const [error, setError] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const projectRef = useRef<ProjectRecord | null>(null);
  const timer = useRef<number | null>(null);
  const saveSeq = useRef(0);
  projectRef.current = project;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const before = await repository.listProjects();
      if (!(await repository.getProject(DEMO_BLANK_ID))) await repository.saveProject(blankDemo());
      if (!(await repository.getProject(DEMO_CONTINUED_ID))) await repository.saveProject(continuedDemo());
      if (cancelled) return;
      const list = await repository.listProjects();
      const only = before.length === 1 ? await repository.getProject(before[0].id) : null;
      const untouched =
        before.length === 0 ||
        (only !== null && only.name === "Sin título" && only.contextDocs.length === 0 && isEmptyStory(only.document));
      const openId = untouched ? DEMO_CONTINUED_ID : (list[0]?.id ?? DEMO_CONTINUED_ID);
      const current = await repository.getProject(openId);
      if (cancelled || !current) return;
      setProjects(list);
      setProject(current);
    })().catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "No se pudo abrir el archivo local.");
    });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      const current = projectRef.current;
      if (!current) return;
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      void repository.saveProject(current);
    };
    const onPageHide = () => {
      const current = projectRef.current;
      if (!current) return;
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      void repository.saveProject(current);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [repository]);

  const scene = useMemo(() => {
    if (!project) return null;
    try {
      const doc = documentFromJSON(project.document);
      const cursor = project.cursor ?? 1;
      const draft = assemblePrompt(doc, cursor, project.format, project.style, project.contextDocs);
      const preview = mockContinuation({
        started: draft.recent !== null,
        atSceneEnd: (draft.recent?.text ?? "").includes("se apagó"),
        names: draft.contextDocs.map((item) => item.label),
        weights: project.styleMix,
      });
      return { draft, preview };
    } catch {
      return null;
    }
  }, [project]);

  function remember(next: ProjectRecord) {
    projectRef.current = next;
    setProject(next);
    setProjects((current) => {
      const summary = toSummary(next);
      const rest = current.filter((item) => item.id !== next.id);
      return [summary, ...rest];
    });
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
    partial: Partial<Pick<ProjectRecord, "name" | "format" | "style" | "styleMix" | "contextDocs">>,
    when: "now" | "soon",
  ) {
    const current = projectRef.current;
    if (!current) return;
    commit({ ...current, ...partial, updatedAt: new Date().toISOString() }, when);
  }

  function onDocument(document: JSONContent) {
    const current = projectRef.current;
    if (!current) return;
    commit({ ...current, document, updatedAt: new Date().toISOString() }, "soon");
  }

  function onCursor(cursor: number) {
    const current = projectRef.current;
    if (!current || current.cursor === cursor) return;
    commit({ ...current, cursor, updatedAt: new Date().toISOString() }, "soon");
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
    remember(opened);
    await repository.saveProject(opened);
    setSaveLabel("Guardado");
    setContextOpen(false);
  }

  async function createProject() {
    await flush();
    const next = await repository.createProject("Sin título");
    remember(next);
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
    if (!(await repository.getProject(DEMO_BLANK_ID))) await repository.saveProject(blankDemo());
    if (!(await repository.getProject(DEMO_CONTINUED_ID))) await repository.saveProject(continuedDemo());
    const list = await repository.listProjects();
    const next = await repository.getProject(list[0]?.id ?? DEMO_CONTINUED_ID);
    setProjects(list);
    if (next) remember(next);
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
        <div className="mx-auto w-full max-w-[42rem] px-5 py-8">
          <p className="mb-6 text-sm text-white/40">
            {scene.draft.recent
              ? "El texto gris sigue desde el cursor. Es una propuesta mock, sin modelo."
              : "Todavía no hay texto. El gris muestra cómo empezaría, sin modelo."}
          </p>
          <NarrativeEditor
            key={project.id}
            projectId={project.id}
            initial={project.document}
            initialCursor={project.cursor}
            placeAtEnd={project.cursor == null && project.id === DEMO_CONTINUED_ID}
            preview={scene.preview}
            onChange={onDocument}
            onCursor={onCursor}
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
              preview={scene.preview}
              draft={scene.draft}
              influence={project.influence}
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
