"use client";

import { create } from "zustand";
import { type DeskSnapshot, type LineOrigin } from "@/lib/library";
import { composeBeat } from "@/lib/prompt";
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
  wordsOf,
} from "@/lib/text";

const INITIAL_CURSOR = 9;

type DeskState = {
  lines: string[];
  origins: Record<number, LineOrigin>;
  prompts: Record<number, string>;
  cursor: number;
  revealed: number;
  freshIndex: number | null;
  variant: number;
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
  writeTake: () => void;
  bumpVariant: () => void;
  addBox: (lineIndex: number, wordIndex: number) => void;
  addSpan: (lineIndex: number, wordStart: number, wordEnd: number) => void;
  moveBox: (id: string, lineIndex: number, wordIndex: number) => void;
  setBoxWeight: (id: string, weight: number) => void;
  removeBox: (id: string) => void;
  selectBox: (id: string | null) => void;
  setActiveFactor: (id: FactorId) => void;
  setFactorValue: (id: FactorId, value: number) => void;
  addDoc: (name: string, kind: DocKind, text: string) => void;
  removeDoc: (id: string) => void;
  setDrawerOpen: (open: boolean) => void;
  applySnapshot: (snapshot: DeskSnapshot) => void;
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

function prune<T>(record: Record<number, T>, before: number): Record<number, T> {
  const next: Record<number, T> = {};
  for (const [key, value] of Object.entries(record)) {
    if (Number(key) < before) next[Number(key)] = value;
  }
  return next;
}

function takeFrom(state: DeskState) {
  const beat = composeBeat({
    lines: state.lines,
    cursor: state.cursor,
    boxes: state.boxes,
    factors: state.factors,
    docs: state.docs,
    activeFactor: state.activeFactor,
    variant: state.variant,
  });
  const index = state.cursor;
  const lines = state.lines.slice(0, index);
  lines.push(beat.sentence);
  return {
    lines,
    origins: { ...prune(state.origins, index), [index]: "mock" as const },
    prompts: { ...prune(state.prompts, index), [index]: beat.rendered },
    checks: prune(state.checks, index),
    cursor: index + 1,
    revealed: index + 1,
    freshIndex: index,
  };
}

function mergeSpan(state: DeskState, lineIndex: number, wordStart: number, wordEnd: number) {
  const start = Math.min(wordStart, wordEnd);
  const end = Math.max(wordStart, wordEnd);
  const overlapping = state.boxes.filter(
    (box) => box.lineIndex === lineIndex && box.wordEnd >= start && box.wordStart <= end,
  );
  const mergedStart = Math.min(start, ...overlapping.map((box) => box.wordStart));
  const mergedEnd = Math.max(end, ...overlapping.map((box) => box.wordEnd));
  const kept = overlapping[0];
  const id = kept?.id ?? crypto.randomUUID();
  const rest = state.boxes.filter((box) => !overlapping.includes(box));
  return {
    boxes: [
      ...rest,
      {
        id,
        lineIndex,
        wordStart: mergedStart,
        wordEnd: mergedEnd,
        weight: kept?.weight ?? 0.8,
      },
    ],
    selectedBoxId: id,
  };
}

export const useDesk = create<DeskState>((set) => ({
  lines: SAMPLE_LINES,
  origins: {},
  prompts: {},
  cursor: INITIAL_CURSOR,
  revealed: INITIAL_CURSOR,
  freshIndex: null,
  variant: 0,
  boxes: [
    { id: "box-pagina", lineIndex: 6, wordStart: 8, wordEnd: 11, weight: 0.9 },
    { id: "box-puente", lineIndex: 4, wordStart: 11, wordEnd: 13, weight: 0.72 },
    { id: "box-nina", lineIndex: 2, wordStart: 0, wordEnd: 1, weight: 0.5 },
  ],
  selectedBoxId: "box-pagina",
  factors: FACTORS,
  activeFactor: "tono",
  docs: SAMPLE_DOCS,
  drawerOpen: false,
  checks: initialChecks(SAMPLE_LINES, INITIAL_CURSOR, FACTORS),
  setCursor: (next) =>
    set((state) => {
      const target = Math.max(0, Math.min(state.lines.length, Math.round(next)));
      if (target <= state.revealed) return { cursor: target, freshIndex: null };
      const stepTo = Math.min(state.revealed + 1, state.lines.length);
      return { cursor: stepTo, revealed: stepTo, freshIndex: null };
    }),
  step: (direction) =>
    set((state) => {
      if (direction < 0) return { cursor: Math.max(0, state.cursor - 1), freshIndex: null };
      if (state.cursor < state.lines.length) {
        const stepTo = state.cursor + 1;
        return {
          cursor: stepTo,
          revealed: Math.max(state.revealed, stepTo),
          freshIndex: null,
        };
      }
      return takeFrom(state);
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
  writeTake: () => set((state) => takeFrom(state)),
  bumpVariant: () => set((state) => ({ variant: (state.variant + 1) % 4 })),
  addBox: (lineIndex, wordIndex) =>
    set((state) => {
      const existing = state.boxes.find(
        (box) => box.lineIndex === lineIndex && wordIndex >= box.wordStart && wordIndex <= box.wordEnd,
      );
      if (existing && existing.wordStart === wordIndex && existing.wordEnd === wordIndex) {
        return { selectedBoxId: existing.id };
      }
      if (existing) return { selectedBoxId: existing.id };
      return mergeSpan(state, lineIndex, wordIndex, wordIndex);
    }),
  addSpan: (lineIndex, wordStart, wordEnd) => set((state) => mergeSpan(state, lineIndex, wordStart, wordEnd)),
  moveBox: (id, lineIndex, wordIndex) =>
    set((state) => ({
      boxes: state.boxes.map((box) => {
        if (box.id !== id) return box;
        const length = box.wordEnd - box.wordStart;
        const last = Math.max(0, wordsOf(state.lines[lineIndex] ?? "").length - 1);
        const wordStart = Math.max(0, Math.min(wordIndex, last));
        return {
          ...box,
          lineIndex,
          wordStart,
          wordEnd: Math.min(last, wordStart + length),
        };
      }),
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
  applySnapshot: (snapshot) =>
    set(() => {
      const lines = snapshot.lines.map((line) => line.text);
      const origins: Record<number, LineOrigin> = {};
      const prompts: Record<number, string> = {};
      snapshot.lines.forEach((line, index) => {
        if (line.origin === "mock") origins[index] = "mock";
        if (line.prompt) prompts[index] = line.prompt;
      });
      const cursor = Math.max(0, Math.min(lines.length, snapshot.cursor));
      return {
        lines,
        origins,
        prompts,
        cursor,
        revealed: lines.length,
        freshIndex: null,
        variant: snapshot.variant ?? 0,
        boxes: snapshot.boxes,
        selectedBoxId: snapshot.boxes[0]?.id ?? null,
        factors: snapshot.factors.length > 0 ? snapshot.factors : FACTORS,
        activeFactor: snapshot.factors[0]?.id ?? "tono",
        docs: snapshot.docs,
        checks: initialChecks(lines, cursor, snapshot.factors.length > 0 ? snapshot.factors : FACTORS),
      };
    }),
}));
