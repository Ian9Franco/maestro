"use client";

import { useCallback, useEffect, useState } from "react";
import { ContextDrawer } from "@/components/ContextDrawer";
import { ContextVectors } from "@/components/ContextVectors";
import { Factors } from "@/components/Factors";
import { Manuscript } from "@/components/Manuscript";
import { Origin } from "@/components/Origin";
import { PromptPanel } from "@/components/PromptPanel";
import { Reel } from "@/components/Reel";
import { Timeline } from "@/components/Timeline";
import { type DeskSnapshot, readSession, writeSession } from "@/lib/library";
import { useDesk } from "@/lib/store";
import { type DocKind } from "@/lib/text";

export function Desk() {
  const step = useDesk((state) => state.step);
  const docs = useDesk((state) => state.docs);
  const setDrawerOpen = useDesk((state) => state.setDrawerOpen);
  const drawerOpen = useDesk((state) => state.drawerOpen);
  const addDoc = useDesk((state) => state.addDoc);
  const removeBox = useDesk((state) => state.removeBox);
  const selectedBoxId = useDesk((state) => state.selectedBoxId);
  const selectBox = useDesk((state) => state.selectBox);
  const applySnapshot = useDesk((state) => state.applySnapshot);
  const undo = useDesk((state) => state.undo);
  const setPage = useDesk((state) => state.setPage);
  const page = useDesk((state) => state.page);
  const curve = useDesk((state) => state.curve);
  const closeOrigin = useDesk((state) => state.closeOrigin);
  const [heights, setHeights] = useState<number[]>([]);

  useEffect(() => {
    const saved = readSession();
    if (saved) applySnapshot(saved);
    return useDesk.subscribe((state) => {
      writeSession(snapshotFrom(state));
    });
  }, [applySnapshot]);

  const onHeight = useCallback((index: number, height: number) => {
    setHeights((current) => {
      if (Math.abs((current[index] ?? 0) - height) < 1) return current;
      const next = current.slice();
      next[index] = height;
      return next;
    });
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "PageDown") setPage(page + 1);
      if (event.key === "PageUp") setPage(page - 1);
      if (event.key === "Escape") {
        if (curve !== "closed") closeOrigin();
        else {
          setDrawerOpen(false);
          selectBox(null);
        }
      }
      if ((event.key === "Backspace" || event.key === "Delete") && selectedBoxId) {
        removeBox(selectedBoxId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeOrigin, curve, page, removeBox, selectBox, selectedBoxId, setDrawerOpen, setPage, step, undo]);

  return (
    <main
      className="relative h-screen overflow-hidden bg-black text-[#e6e6e6]"
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length === 0) return;
        event.preventDefault();
        void readDropped(event.dataTransfer.files, addDoc);
      }}
    >
      <div data-scroller className="absolute inset-x-0 top-0 bottom-7 overflow-x-hidden overflow-y-auto">
        <div className="w-full">
          <div className="flex items-center justify-between gap-3 px-3 pt-3 md:hidden">
            <Factors layout="row" />
            <button
              type="button"
              className="shrink-0 text-[11px] tracking-wide text-white/45"
              onClick={() => setDrawerOpen(!drawerOpen)}
            >
              contexto · {docs.length}
            </button>
          </div>
          <div className="grid items-start grid-cols-[auto_minmax(0,1fr)] md:grid-cols-[auto_minmax(0,1fr)_300px]">
            <Reel heights={heights} />
            <div className="min-w-0">
              <div className="desk-copy">
                <Manuscript onHeight={onHeight} />
              </div>
            </div>
            <aside className="sticky top-0 hidden h-[calc(100vh-1.75rem)] w-[300px] flex-col border-l border-white/10 md:flex">
              <button
                type="button"
                className="px-4 pt-4 text-left text-[11px] tracking-wide text-white/40 transition-colors hover:text-white/80"
                onClick={() => setDrawerOpen(!drawerOpen)}
              >
                contexto · {docs.length}
              </button>
              <Factors />
              <PromptPanel />
            </aside>
          </div>
        </div>
      </div>

      <ContextVectors />
      <Origin />
      <Timeline />
      <ContextDrawer />
    </main>
  );
}

function snapshotFrom(state: ReturnType<typeof useDesk.getState>): DeskSnapshot {
  return {
    version: 1,
    name: "sesión",
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

async function readDropped(
  files: FileList,
  addDoc: (name: string, kind: DocKind, text: string) => void,
) {
  for (const file of files) {
    if (file.size > 1_000_000) continue;
    const text = await file.text();
    addDoc(file.name.replace(/\.(txt|md)$/i, ""), "notas", text);
  }
}
