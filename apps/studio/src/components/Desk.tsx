"use client";

import { useCallback, useEffect, useState } from "react";
import { Arc } from "@/components/Arc";
import { ContextDrawer } from "@/components/ContextDrawer";
import { Factors } from "@/components/Factors";
import { Manuscript } from "@/components/Manuscript";
import { Reel } from "@/components/Reel";
import { Timeline } from "@/components/Timeline";
import { useDesk } from "@/lib/store";
import { type DocKind } from "@/lib/text";

export function Desk() {
  const step = useDesk((state) => state.step);
  const docs = useDesk((state) => state.docs);
  const drawerOpen = useDesk((state) => state.drawerOpen);
  const setDrawerOpen = useDesk((state) => state.setDrawerOpen);
  const addDoc = useDesk((state) => state.addDoc);
  const removeBox = useDesk((state) => state.removeBox);
  const selectedBoxId = useDesk((state) => state.selectedBoxId);
  const selectBox = useDesk((state) => state.selectBox);
  const [heights, setHeights] = useState<number[]>([]);

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
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "Escape") {
        setDrawerOpen(false);
        selectBox(null);
      }
      if ((event.key === "Backspace" || event.key === "Delete") && selectedBoxId) {
        removeBox(selectedBoxId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [removeBox, selectBox, selectedBoxId, setDrawerOpen, step]);

  return (
    <main
      className="desk-grid relative h-screen overflow-hidden text-white"
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length === 0) return;
        event.preventDefault();
        void readDropped(event.dataTransfer.files, addDoc);
      }}
    >
      <header className="absolute inset-x-0 top-0 z-30 flex h-12 items-center justify-between px-5">
        <div className="text-sm tracking-wide text-white/80">Maestro</div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn" onClick={() => step(-1)} aria-label="Línea anterior">
            −
          </button>
          <button type="button" className="btn" onClick={() => step(1)} aria-label="Línea siguiente">
            +
          </button>
          <button type="button" className="btn" onClick={() => setDrawerOpen(!drawerOpen)}>
            Contexto · {docs.length}
          </button>
        </div>
      </header>

      <div className="absolute inset-x-0 top-12 bottom-[212px] grid grid-cols-[76px_minmax(0,1fr)_200px]">
        <div data-scroller className="col-span-2 overflow-auto">
          <div className="flex min-h-full items-start px-2 pt-2">
            <Reel heights={heights} />
            <Manuscript onHeight={onHeight} />
          </div>
        </div>
        <div className="border-l border-white/10">{drawerOpen ? null : <Factors />}</div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-11 z-20 h-[168px]">
        <Arc />
      </div>
      <Timeline />
      <ContextDrawer />
    </main>
  );
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
