"use client";

import { create } from "zustand";
import { type DeskSnapshot, type LineOrigin } from "@/lib/library";
import { composeBeat } from "@/lib/prompt";
import {
  type AttentionBox,
  type DocKind,
  FACTORS,
  type Factor,
  type CurveView,
  type FactorHits,
  type FactorId,
  type SourceDoc,
  SAMPLE_DOCS,
  SAMPLE_LINES,
  factorHit,
  splitSpans,
  wordsOf,
} from "@/lib/text";

export const PAGE_SIZE = 20;

const INITIAL_LINES = SAMPLE_LINES;

type HistorySnap = {
  lines: string[];
  origins: Record<number, LineOrigin>;
  prompts: Record<number, string>;
  cursor: number;
  revealed: number;
  boxes: AttentionBox[];
  selectedBoxId: string | null;
  blocked: Record<number, true>;
  checks: Record<number, FactorHits>;
  variant: number;
  page: number;
  curve: CurveView;
  steers: FactorId[];
};

type DeskState = {
  lines: string[];
  origins: Record<number, LineOrigin>;
  prompts: Record<number, string>;
  cursor: number;
  revealed: number;
  freshIndex: number | null;
  variant: number;
  page: number;
  blocked: Record<number, true>;
  history: HistorySnap[];
  gesturing: boolean;
  boxes: AttentionBox[];
  selectedBoxId: string | null;
  factors: Factor[];
  activeFactor: FactorId;
  curve: CurveView;
  steers: FactorId[];
  docs: SourceDoc[];
  drawerOpen: boolean;
  checks: Record<number, FactorHits>;
  setCursor: (next: number) => void;
  step: (direction: -1 | 1) => void;
  settleFresh: () => void;
  writeTake: () => void;
  beginGesture: () => void;
  endGesture: () => void;
  undo: () => void;
  cutTo: (keepUntil: number) => void;
  toggleBlock: (index: number) => void;
  setPage: (page: number) => void;
  bumpVariant: () => void;
  addBox: (lineIndex: number, wordIndex: number) => void;
  addSpan: (lineIndex: number, wordStart: number, wordEnd: number) => void;
  moveBox: (id: string, lineIndex: number, wordIndex: number) => void;
  setBoxWeight: (id: string, weight: number) => void;
  removeBox: (id: string) => void;
  selectBox: (id: string | null) => void;
  setActiveFactor: (id: FactorId) => void;
  setFactorValue: (id: FactorId, value: number) => void;
  toggleOrigin: () => void;
  openCurve: (id: FactorId) => void;
  closeOrigin: () => void;
  addDoc: (name: string, kind: DocKind, text: string) => void;
  removeDoc: (id: string) => void;
  setDrawerOpen: (open: boolean) => void;
  applySnapshot: (snapshot: DeskSnapshot) => void;
};

function hitsFor(line: string, factors: Factor[]): FactorHits {
  const hits: FactorHits = {};
  for (const factor of factors) hits[factor.id] = factorHit(line, factor);
  return hits;
}

function initialChecks(lines: string[], upto: number, factors: Factor[]) {
  const checks: Record<number, FactorHits> = {};
  for (let index = 0; index < upto; index += 1) {
    checks[index] = hitsFor(lines[index] ?? "", factors);
  }
  return checks;
}

function pageFor(cursor: number) {
  if (cursor <= 0) return 0;
  return Math.floor((cursor - 1) / PAGE_SIZE);
}

function capture(state: DeskState): HistorySnap {
  return {
    lines: state.lines,
    origins: state.origins,
    prompts: state.prompts,
    cursor: state.cursor,
    revealed: state.revealed,
    boxes: state.boxes,
    selectedBoxId: state.selectedBoxId,
    blocked: state.blocked,
    checks: state.checks,
    variant: state.variant,
    page: state.page,
    curve: state.curve,
    steers: state.steers,
  };
}

function edited(state: DeskState, next: HistorySnap) {
  if (state.gesturing) return next;
  return { ...next, history: [...state.history, capture(state)].slice(-40) };
}

function project(state: DeskState, kept: number[]): HistorySnap {
  const lines: string[] = [];
  const origins: Record<number, LineOrigin> = {};
  const prompts: Record<number, string> = {};
  const blocked: Record<number, true> = {};
  const checks: Record<number, FactorHits> = {};
  const map = new Map<number, number>();
  kept.forEach((index) => {
    const next = lines.length;
    map.set(index, next);
    lines.push(state.lines[index] ?? "");
    if (state.origins[index]) origins[next] = state.origins[index];
    if (state.prompts[index]) prompts[next] = state.prompts[index];
    if (state.blocked[index]) blocked[next] = true;
    if (state.checks[index]) checks[next] = state.checks[index];
  });
  const boxes = state.boxes.flatMap((box) => {
    const lineIndex = map.get(box.lineIndex);
    if (lineIndex === undefined) return [];
    return [{ ...box, lineIndex }];
  });
  const cursor = lines.length;
  return {
    lines,
    origins,
    prompts,
    cursor,
    revealed: cursor,
    boxes,
    selectedBoxId: boxes.some((box) => box.id === state.selectedBoxId) ? state.selectedBoxId : (boxes[0]?.id ?? null),
    blocked,
    checks,
    variant: state.variant,
    page: pageFor(cursor),
    curve: state.curve,
    steers: state.steers,
  };
}

function keptIndexes(state: DeskState, keepUntil: number) {
  const limit = Math.max(0, Math.min(state.lines.length, Math.round(keepUntil)));
  const kept: number[] = [];
  state.lines.forEach((_, index) => {
    if (index < limit || state.blocked[index]) kept.push(index);
  });
  return kept;
}

function cutTo(state: DeskState, keepUntil: number) {
  const kept = keptIndexes(state, keepUntil);
  if (kept.length === state.lines.length && kept.every((index, order) => index === order)) return state;
  return { ...edited(state, project(state, kept)), freshIndex: null };
}

function takeFrom(state: DeskState) {
  const base = project(state, keptIndexes(state, state.cursor));
  const beat = composeBeat({
    lines: base.lines,
    cursor: base.lines.length,
    boxes: base.boxes,
    factors: state.factors,
    docs: state.docs,
    activeFactor: state.activeFactor,
    steers: state.steers,
    variant: state.variant,
  });
  const index = base.lines.length;
  const lines = [...base.lines, beat.sentence];
  return {
    ...edited(state, {
      ...base,
      lines,
      origins: { ...base.origins, [index]: "mock" },
      prompts: { ...base.prompts, [index]: beat.rendered },
      cursor: index + 1,
      revealed: index + 1,
      page: pageFor(index + 1),
      variant: (state.variant + 1) % 4,
    }),
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
  lines: INITIAL_LINES,
  origins: {},
  prompts: {},
  cursor: INITIAL_LINES.length,
  revealed: INITIAL_LINES.length,
  freshIndex: null,
  variant: 0,
  page: pageFor(INITIAL_LINES.length),
  blocked: {},
  history: [],
  gesturing: false,
  boxes: [
    { id: "box-pagina", lineIndex: 6, wordStart: 8, wordEnd: 11, weight: 0.9 },
    { id: "box-puente", lineIndex: 4, wordStart: 11, wordEnd: 13, weight: 0.72 },
    { id: "box-nina", lineIndex: 2, wordStart: 0, wordEnd: 1, weight: 0.5 },
  ],
  selectedBoxId: "box-pagina",
  factors: FACTORS,
  activeFactor: "tono",
  curve: "closed",
  steers: [],
  docs: SAMPLE_DOCS,
  drawerOpen: false,
  checks: initialChecks(INITIAL_LINES, INITIAL_LINES.length, FACTORS),
  setCursor: (next) => set((state) => cutTo(state, next)),
  step: (direction) => set((state) => (direction < 0 ? cutTo(state, state.cursor - 1) : takeFrom(state))),
  beginGesture: () =>
    set((state) => {
      if (state.gesturing) return state;
      return { gesturing: true, history: [...state.history, capture(state)].slice(-40) };
    }),
  endGesture: () =>
    set((state) => {
      if (!state.gesturing) return state;
      const previous = state.history[state.history.length - 1];
      const unchanged =
        previous !== undefined &&
        previous.cursor === state.cursor &&
        previous.lines.length === state.lines.length &&
        previous.lines.every((line, index) => line === state.lines[index]);
      return {
        gesturing: false,
        history: unchanged ? state.history.slice(0, -1) : state.history,
      };
    }),
  undo: () =>
    set((state) => {
      const previous = state.history[state.history.length - 1];
      if (!previous) return state;
      return {
        ...state,
        ...previous,
        history: state.history.slice(0, -1),
        gesturing: false,
        freshIndex: null,
      };
    }),
  cutTo: (keepUntil) => set((state) => cutTo(state, keepUntil)),
  toggleBlock: (index) =>
    set((state) => {
      const blocked = { ...state.blocked };
      if (blocked[index]) delete blocked[index];
      else blocked[index] = true;
      return edited(state, { ...capture(state), blocked });
    }),
  setPage: (page) =>
    set((state) => {
      const pages = Math.max(1, Math.ceil(Math.max(state.cursor, 1) / PAGE_SIZE));
      return { page: Math.max(0, Math.min(pages - 1, Math.round(page))) };
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
  toggleOrigin: () =>
    set((state) => {
      if (state.curve === "closed") return { curve: "ring" };
      if (state.curve === "ring") return { curve: "closed" };
      return { curve: "ring" };
    }),
  openCurve: (id) =>
    set((state) => ({
      curve: id,
      activeFactor: id,
      steers: state.steers.includes(id) ? state.steers : [...state.steers, id],
    })),
  closeOrigin: () => set({ curve: "closed" }),
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
      const cursor = lines.length;
      const blocked: Record<number, true> = {};
      for (const index of snapshot.blocked ?? []) {
        if (index >= 0 && index < lines.length) blocked[index] = true;
      }
      return {
        lines,
        origins,
        prompts,
        cursor,
        revealed: cursor,
        freshIndex: null,
        variant: snapshot.variant ?? 0,
        page: pageFor(cursor),
        blocked,
        history: [],
        gesturing: false,
        boxes: snapshot.boxes,
        selectedBoxId: snapshot.boxes[0]?.id ?? null,
        factors: snapshot.factors.length > 0 ? snapshot.factors : FACTORS,
        activeFactor: snapshot.factors[0]?.id ?? "tono",
        curve: "closed",
        steers: [],
        docs: snapshot.docs,
        checks: initialChecks(lines, cursor, snapshot.factors.length > 0 ? snapshot.factors : FACTORS),
      };
    }),
}));
