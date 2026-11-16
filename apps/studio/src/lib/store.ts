"use client";

import { create } from "zustand";
import {
  type AttentionBox,
  type DocKind,
  FACTORS,
  type Factor,
  type FactorHits,
  type FactorId,
  type SourceDoc,
  SAMPLE_DOCS,
  SAMPLE_LINES,
  factorHit,
  splitSpans,
} from "@/lib/text";

const INITIAL_CURSOR = 9;

type DeskState = {
  lines: string[];
  cursor: number;
  revealed: number;
  freshIndex: number | null;
  boxes: AttentionBox[];
  selectedBoxId: string | null;
  factors: Factor[];
  activeFactor: FactorId;
  docs: SourceDoc[];
  drawerOpen: boolean;
  checks: Record<number, FactorHits>;
  setCursor: (next: number) => void;
  step: (direction: -1 | 1) => void;
  settleFresh: () => void;
  addBox: (lineIndex: number, wordIndex: number) => void;
  moveBox: (id: string, lineIndex: number, wordIndex: number) => void;
  setBoxWeight: (id: string, weight: number) => void;
  removeBox: (id: string) => void;
  selectBox: (id: string | null) => void;
  setActiveFactor: (id: FactorId) => void;
  setFactorValue: (id: FactorId, value: number) => void;
  addDoc: (name: string, kind: DocKind, text: string) => void;
  removeDoc: (id: string) => void;
  setDrawerOpen: (open: boolean) => void;
};

function hitsFor(line: string, factors: Factor[]): FactorHits {
  return {
    tono: factorHit(line, factors.find((factor) => factor.id === "tono") ?? FACTORS[0]),
    tension: factorHit(line, factors.find((factor) => factor.id === "tension") ?? FACTORS[1]),
    foco: factorHit(line, factors.find((factor) => factor.id === "foco") ?? FACTORS[2]),
  };
}

function initialChecks(lines: string[], upto: number, factors: Factor[]) {
  const checks: Record<number, FactorHits> = {};
  for (let index = 0; index < upto; index += 1) {
    checks[index] = hitsFor(lines[index] ?? "", factors);
  }
  return checks;
}

export const useDesk = create<DeskState>((set) => ({
  lines: SAMPLE_LINES,
  cursor: INITIAL_CURSOR,
  revealed: INITIAL_CURSOR,
  freshIndex: null,
  boxes: [{ id: "box-puente", lineIndex: 7, wordIndex: 3, weight: 0.8 }],
  selectedBoxId: "box-puente",
  factors: FACTORS,
  activeFactor: "tono",
  docs: SAMPLE_DOCS,
  drawerOpen: false,
  checks: initialChecks(SAMPLE_LINES, INITIAL_CURSOR, FACTORS),
  setCursor: (next) =>
    set((state) => {
      const target = Math.max(0, Math.min(state.lines.length, Math.round(next)));
      if (target <= state.revealed) return { cursor: target, freshIndex: null };
      const stepTo = state.revealed + 1;
      return { cursor: stepTo, revealed: stepTo, freshIndex: stepTo - 1 };
    }),
  step: (direction) =>
    set((state) => {
      if (direction < 0) return { cursor: Math.max(0, state.cursor - 1), freshIndex: null };
      if (state.cursor < state.revealed) return { cursor: state.cursor + 1, freshIndex: null };
      if (state.cursor >= state.lines.length) return state;
      const stepTo = state.cursor + 1;
      return { cursor: stepTo, revealed: stepTo, freshIndex: stepTo - 1 };
    }),
  settleFresh: () =>
    set((state) => {
      if (state.freshIndex === null) return state;
      const line = state.lines[state.freshIndex] ?? "";
      return {
        freshIndex: null,
        checks: { ...state.checks, [state.freshIndex]: hitsFor(line, state.factors) },
      };
    }),
  addBox: (lineIndex, wordIndex) =>
    set((state) => {
      const existing = state.boxes.find(
        (box) => box.lineIndex === lineIndex && box.wordIndex === wordIndex,
      );
      if (existing) return { selectedBoxId: existing.id };
      const id = crypto.randomUUID();
      return {
        boxes: [...state.boxes, { id, lineIndex, wordIndex, weight: 0.8 }],
        selectedBoxId: id,
      };
    }),
  moveBox: (id, lineIndex, wordIndex) =>
    set((state) => ({
      boxes: state.boxes.map((box) => (box.id === id ? { ...box, lineIndex, wordIndex } : box)),
      selectedBoxId: id,
    })),
  setBoxWeight: (id, weight) =>
    set((state) => ({
      boxes: state.boxes.map((box) =>
        box.id === id ? { ...box, weight: Math.max(0.15, Math.min(1, weight)) } : box,
      ),
    })),
  removeBox: (id) =>
    set((state) => ({
      boxes: state.boxes.filter((box) => box.id !== id),
      selectedBoxId: state.selectedBoxId === id ? null : state.selectedBoxId,
    })),
  selectBox: (id) => set({ selectedBoxId: id }),
  setActiveFactor: (id) => set({ activeFactor: id }),
  setFactorValue: (id, value) =>
    set((state) => ({
      factors: state.factors.map((factor) =>
        factor.id === id ? { ...factor, value: Math.max(-1, Math.min(1, value)) } : factor,
      ),
    })),
  addDoc: (name, kind, text) =>
    set((state) => {
      const spans = splitSpans(text);
      if (spans.length === 0) return state;
      return {
        docs: [
          ...state.docs,
          { id: crypto.randomUUID(), name: name.trim() || "Sin título", kind, text, spans },
        ],
        drawerOpen: true,
      };
    }),
  removeDoc: (id) => set((state) => ({ docs: state.docs.filter((doc) => doc.id !== id) })),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
}));
