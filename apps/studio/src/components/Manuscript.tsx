"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { composeBeat } from "@/lib/prompt";
import { useDesk } from "@/lib/store";
import { type AttentionBox, coversWord, wordsOf } from "@/lib/text";

type WordRect = {
  line: number;
  word: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

type Point = { x: number; y: number };

type Drag =
  | { kind: "move"; id: string; dx: number; dy: number; x: number; y: number }
  | { kind: "weight"; id: string; startX: number; startWeight: number }
  | { kind: "select"; anchorLine: number; anchorWord: number; line: number; word: number };

type Landing = { id: string; fromX: number; fromY: number; started: number };

export function Manuscript({ onHeight }: { onHeight: (index: number, height: number) => void }) {
  const lines = useDesk((state) => state.lines);
  const cursor = useDesk((state) => state.cursor);
  const freshIndex = useDesk((state) => state.freshIndex);
  const boxes = useDesk((state) => state.boxes);
  const selectedBoxId = useDesk((state) => state.selectedBoxId);
  const origins = useDesk((state) => state.origins);
  const factors = useDesk((state) => state.factors);
  const activeFactor = useDesk((state) => state.activeFactor);
  const docs = useDesk((state) => state.docs);
  const variant = useDesk((state) => state.variant);
  const addBox = useDesk((state) => state.addBox);
  const addSpan = useDesk((state) => state.addSpan);
  const moveBox = useDesk((state) => state.moveBox);
  const setBoxWeight = useDesk((state) => state.setBoxWeight);
  const removeBox = useDesk((state) => state.removeBox);
  const selectBox = useDesk((state) => state.selectBox);
  const settleFresh = useDesk((state) => state.settleFresh);

  const contentRef = useRef<HTMLDivElement>(null);
  const wordsRef = useRef<WordRect[]>([]);
  const dragRef = useRef<Drag | null>(null);
  const [words, setWords] = useState<WordRect[]>([]);
  const [caret, setCaret] = useState<Point | null>(null);
  const [railX, setRailX] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [landing, setLanding] = useState<Landing | null>(null);
  const [, setFrame] = useState(0);

  const measure = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;
    const origin = content.getBoundingClientRect();
    const next: WordRect[] = [];
    content.querySelectorAll<HTMLElement>("[data-word-index]").forEach((element) => {
      const rect = element.getBoundingClientRect();
      next.push({
        line: Number(element.dataset.line),
        word: Number(element.dataset.wordIndex),
        x: rect.left - origin.left,
        y: rect.top - origin.top,
        w: rect.width,
        h: rect.height,
      });
    });
    content.querySelectorAll<HTMLElement>("[data-row]").forEach((element) => {
      onHeight(Number(element.dataset.row), element.getBoundingClientRect().height);
    });
    const caretEl = content.querySelector<HTMLElement>("[data-caret]");
    const nextCaret = caretEl
      ? {
          x: caretEl.getBoundingClientRect().left - origin.left,
          y: caretEl.getBoundingClientRect().top - origin.top + caretEl.getBoundingClientRect().height / 2,
        }
      : null;
    wordsRef.current = next;
    setWords((current) => (sameWords(current, next) ? current : next));
    setCaret((current) => (samePoint(current, nextCaret) ? current : nextCaret));
    setRailX((current) => {
      const nextRail = Math.max(0, content.clientWidth - 2);
      return Math.abs(current - nextRail) < 0.5 ? current : nextRail;
    });
  }, [onHeight]);

  useLayoutEffect(() => {
    measure();
  }, [measure, cursor, freshIndex, boxes, lines]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const scroller = content.closest("[data-scroller]");
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    scroller?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      scroller?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  useEffect(() => {
    if (freshIndex === null) return;
    let frame = 0;
    const tick = () => {
      measure();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [freshIndex, measure]);

  useEffect(() => {
    if (!landing) return;
    let frame = 0;
    const tick = () => {
      if (performance.now() - landing.started >= 220) {
        setLanding(null);
        return;
      }
      setFrame((value) => value + 1);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [landing]);

  useEffect(() => {
    function move(event: PointerEvent) {
      const current = dragRef.current;
      if (!current) return;
      if (current.kind === "move") {
        const origin = contentRef.current?.getBoundingClientRect();
        if (!origin) return;
        const next = {
          ...current,
          x: event.clientX - current.dx - origin.left,
          y: event.clientY - current.dy - origin.top,
        };
        dragRef.current = next;
        setDrag(next);
        return;
      }
      if (current.kind === "select") {
        const origin = contentRef.current?.getBoundingClientRect();
        if (!origin) return;
        const hit = closestWord(wordsRef.current, event.clientX - origin.left, event.clientY - origin.top);
        if (!hit) return;
        const next = { ...current, line: hit.line, word: hit.word };
        dragRef.current = next;
        setDrag(next);
        return;
      }
      setBoxWeight(current.id, current.startWeight + (event.clientX - current.startX) / 140);
    }
    function up() {
      const current = dragRef.current;
      if (!current) return;
      dragRef.current = null;
      if (current.kind === "move") {
        const target = closestWord(wordsRef.current, current.x, current.y);
        if (target) {
          setLanding({ id: current.id, fromX: current.x, fromY: current.y, started: performance.now() });
          moveBox(current.id, target.line, target.word);
        }
      }
      if (current.kind === "select") {
        const spans = rangeSpans(current.anchorLine, current.anchorWord, current.line, current.word, lines);
        const changed = spans.some((span) => span.end > span.start);
        if (changed) {
          for (const span of spans) addSpan(span.line, span.start, span.end);
        }
      }
      setDrag(null);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [addSpan, lines, moveBox, setBoxWeight]);

  function extendTo(line: number, word: number) {
    const selected = boxes.find((box) => box.id === selectedBoxId);
    if (!selected) {
      addSpan(line, word, word);
      return;
    }
    if (selected.lineIndex === line) {
      addSpan(line, selected.wordStart, word);
      return;
    }
    for (const span of rangeSpans(selected.lineIndex, selected.wordStart, line, word, lines)) {
      addSpan(span.line, span.start, span.end);
    }
  }

  function beginSelect(line: number, word: number) {
    const next: Drag = { kind: "select", anchorLine: line, anchorWord: word, line, word };
    dragRef.current = next;
    setDrag(next);
  }

  function beginMove(event: ReactPointerEvent<HTMLElement>, id: string) {
    const content = contentRef.current;
    if (!content) return;
    event.preventDefault();
    const origin = content.getBoundingClientRect();
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const next: Drag = {
      kind: "move",
      id,
      dx: event.clientX - centerX,
      dy: event.clientY - centerY,
      x: centerX - origin.left,
      y: centerY - origin.top,
    };
    dragRef.current = next;
    setDrag(next);
    selectBox(id);
  }

  function beginWeight(event: ReactPointerEvent<HTMLElement>, id: string, weight: number) {
    event.stopPropagation();
    event.preventDefault();
    const next: Drag = { kind: "weight", id, startX: event.clientX, startWeight: weight };
    dragRef.current = next;
    setDrag(next);
  }

  function vectorEnd(box: AttentionBox): Point | null {
    if (drag?.kind === "move" && drag.id === box.id) return { x: drag.x, y: drag.y };
    const covered = words.filter((item) => item.line === box.lineIndex && coversWord(box, item.word));
    const word = covered[covered.length - 1];
    if (!word) return null;
    const anchor = { x: word.x + word.w, y: word.y + word.h / 2 };
    if (landing?.id !== box.id) return anchor;
    const t = Math.min(1, (performance.now() - landing.started) / 200);
    const eased = 1 - (1 - t) ** 3;
    return {
      x: landing.fromX + (anchor.x - landing.fromX) * eased,
      y: landing.fromY + (anchor.y - landing.fromY) * eased,
    };
  }

  const ordered = [...boxes].sort((a, b) => Number(a.id === selectedBoxId) - Number(b.id === selectedBoxId));
  const pending = drag?.kind === "select" ? rangeSpans(drag.anchorLine, drag.anchorWord, drag.line, drag.word, lines) : [];
  const previewBoxes =
    pending.length > 0
      ? [
          ...boxes,
          ...pending.map((span, index) => ({
            id: `pending-${index}`,
            lineIndex: span.line,
            wordStart: span.start,
            wordEnd: span.end,
            weight: 0.8,
          })),
        ]
      : boxes;
  const beat =
    freshIndex === null
      ? composeBeat({ lines, cursor, boxes: previewBoxes, factors, docs, activeFactor, variant })
      : null;

  return (
    <div
      ref={contentRef}
      className="relative min-w-0 pb-36"
      title="Arrastrá de una palabra a otra para fijar una frase. Doble clic fija una sola."
    >
      <div className="h-8" />
      <AnimatePresence initial={false}>
        {lines.slice(0, cursor).map((line, index) => (
          <motion.div
            key={index}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            data-row={index}
            className="flex items-start gap-3 py-px pr-4"
          >
            <span
              className={`mono w-6 shrink-0 text-right text-[11px] leading-[22px] tabular-nums ${origins[index] === "mock" ? "text-[#ff8a5a]" : "text-white/30"}`}
              title={origins[index] === "mock" ? "Oración escrita por la toma mock" : undefined}
            >
              {index + 1}
            </span>
            <p className="mono min-w-0 flex-1 text-[13.5px] leading-[22px] tracking-[-0.01em] text-[#d4d4d4]">
              {freshIndex === index ? (
                <TypedLine text={line} onDone={settleFresh} />
              ) : (
                <LineWords
                  line={line}
                  index={index}
                  boxes={boxes}
                  pending={pending}
                  selectedBoxId={selectedBoxId}
                  onCreate={addBox}
                  onDragStart={beginMove}
                  onSelectStart={beginSelect}
                  onExtend={extendTo}
                />
              )}
              {index === cursor - 1 ? (
                <span data-caret className="inline-block h-[1em] w-px align-middle" />
              ) : null}
            </p>
          </motion.div>
        ))}
      </AnimatePresence>
      {beat ? (
        <div className="flex items-start gap-3 py-px pr-4">
          <span className="mono w-6 shrink-0 text-right text-[11px] leading-[22px] text-[#ff8a5a]/70">+</span>
          <p className="mono min-w-0 flex-1 text-[13.5px] leading-[22px] text-white/35">{beat.sentence}</p>
        </div>
      ) : null}

      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        {caret
          ? ordered.map((box, order) => {
              const end = vectorEnd(box);
              if (!end) return null;
              const selected = box.id === selectedBoxId;
              const d = attentionPath(caret, end, order, railX);
              return (
                <g key={box.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke="#ff4b2a"
                    strokeWidth={3 + box.weight * 2}
                    strokeLinecap="round"
                    opacity={0.13}
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke="#ff5530"
                    strokeWidth={0.75 + box.weight * 1.15}
                    strokeLinecap="round"
                    opacity={selected ? 0.95 : 0.7}
                  />
                  <circle cx={end.x} cy={end.y} r={selected ? 2.6 : 2} fill="#ff5530" />
                </g>
              );
            })
          : null}
        {caret ? (
          <g>
            <circle
              cx={caret.x}
              cy={caret.y}
              r={freshIndex !== null ? 8 : 6.5}
              fill="none"
              stroke="#ff4b2a"
              strokeWidth={freshIndex !== null ? 1.6 : 1.15}
              opacity={0.9}
            />
            <circle cx={caret.x} cy={caret.y} r={2.6} fill="#fff" />
          </g>
        ) : null}
      </svg>

      {boxes.map((box) => {
        const covered = words.filter((item) => item.line === box.lineIndex && coversWord(box, item.word));
        const word = covered[covered.length - 1];
        if (!word || box.id !== selectedBoxId) return null;
        if (drag?.kind === "move" && drag.id === box.id) return null;
        return (
          <div key={box.id}>
            <button
              type="button"
              aria-label="Quitar atención"
              className="absolute z-20 flex h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#ff5a32]/80 bg-black text-[9px] leading-none text-[#ffb7a4]"
              style={{ left: word.x + word.w - 1, top: word.y - 1 }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                removeBox(box.id);
              }}
            >
              ×
            </button>
            <span
              data-handle="weight"
              title={`Atención ${box.weight.toFixed(1)}`}
              aria-label="Peso de atención"
              role="slider"
              aria-valuemin={0.15}
              aria-valuemax={1}
              aria-valuenow={Number(box.weight.toFixed(2))}
              className="absolute z-20 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center"
              style={{ left: word.x + word.w / 2, top: word.y + word.h + 4 }}
              onPointerDown={(event) => beginWeight(event, box.id, box.weight)}
            >
              <span className="h-2 w-2 rounded-full bg-[#ff5a32] shadow-[0_0_8px_rgba(255,80,40,0.85)]" />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LineWords({
  line,
  index,
  boxes,
  pending,
  selectedBoxId,
  onCreate,
  onDragStart,
  onSelectStart,
  onExtend,
}: {
  line: string;
  index: number;
  boxes: AttentionBox[];
  pending: { line: number; start: number; end: number }[];
  selectedBoxId: string | null;
  onCreate: (lineIndex: number, wordIndex: number) => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>, id: string) => void;
  onSelectStart: (line: number, word: number) => void;
  onExtend: (line: number, word: number) => void;
}) {
  const words = wordsOf(line);
  return (
    <>
      {words.map((word, wordIndex) => {
        const box = boxes.find((item) => item.lineIndex === index && coversWord(item, wordIndex));
        const marked = Boolean(box);
        const selected = box?.id === selectedBoxId;
        const drafting = pending.some((span) => span.line === index && wordIndex >= span.start && wordIndex <= span.end);
        return (
          <span key={`${word}-${wordIndex}`}>
            <span
              role="button"
              tabIndex={0}
              aria-label={marked ? `Mover atención de ${word}` : `Fijar ${word}`}
              data-word-index={wordIndex}
              data-line={index}
              className={`rounded-sm ${marked ? "cursor-grab touch-none text-white" : "cursor-pointer"}`}
              style={{
                boxShadow: marked || drafting ? "inset 0 -1px 0 rgba(255,92,48,0.95)" : undefined,
                background: selected || drafting ? "rgba(255,70,40,0.14)" : undefined,
              }}
              onDoubleClick={(event) => {
                event.preventDefault();
                onCreate(index, wordIndex);
              }}
              onPointerDown={(event) => {
                if (event.shiftKey) {
                  event.preventDefault();
                  onExtend(index, wordIndex);
                  return;
                }
                if (box) {
                  onDragStart(event, box.id);
                  return;
                }
                event.preventDefault();
                onSelectStart(index, wordIndex);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") onCreate(index, wordIndex);
              }}
            >
              {word}
            </span>
            {wordIndex < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </>
  );
}

function TypedLine({ text, onDone }: { text: string; onDone: () => void }) {
  const reduce = usePrefersReducedMotion();
  const [count, setCount] = useState(reduce ? text.length : 0);
  const done = useRef(false);

  useEffect(() => {
    if (count >= text.length) {
      if (!done.current) {
        done.current = true;
        onDone();
      }
      return;
    }
    const timeout = window.setTimeout(() => setCount((value) => value + 1), 22);
    return () => window.clearTimeout(timeout);
  }, [count, onDone, text.length]);

  return (
    <>
      {text.slice(0, count)}
      {count < text.length ? <span className="caret" /> : null}
    </>
  );
}

function sameWords(current: WordRect[], next: WordRect[]) {
  if (current.length !== next.length) return false;
  return current.every((item, index) => {
    const other = next[index];
    return (
      other !== undefined &&
      item.line === other.line &&
      item.word === other.word &&
      Math.abs(item.x - other.x) < 0.5 &&
      Math.abs(item.y - other.y) < 0.5 &&
      Math.abs(item.w - other.w) < 0.5 &&
      Math.abs(item.h - other.h) < 0.5
    );
  });
}

function attentionPath(from: Point, to: Point, order: number, rail: number) {
  const right = Math.max(from.x, to.x);
  const bend = Math.min(rail - 4, right + 42 + order * 18);
  return `M ${from.x} ${from.y} C ${bend} ${from.y}, ${bend} ${to.y}, ${to.x} ${to.y}`;
}

function samePoint(current: Point | null, next: Point | null) {
  if (current === null || next === null) return current === next;
  return Math.abs(current.x - next.x) < 0.5 && Math.abs(current.y - next.y) < 0.5;
}

function rangeSpans(
  anchorLine: number,
  anchorWord: number,
  line: number,
  word: number,
  lines: string[],
) {
  const reverse = line < anchorLine || (line === anchorLine && word < anchorWord);
  const from = reverse ? { line, word } : { line: anchorLine, word: anchorWord };
  let toLine = reverse ? anchorLine : line;
  const toWord = reverse ? anchorWord : word;
  if (toLine - from.line > 2) toLine = from.line + 2;
  const spans: { line: number; start: number; end: number }[] = [];
  for (let index = from.line; index <= toLine; index += 1) {
    const count = wordsOf(lines[index] ?? "").length;
    if (count === 0) continue;
    const start = index === from.line ? from.word : 0;
    const end = Math.min(count - 1, index === toLine ? toWord : count - 1);
    if (end >= start) spans.push({ line: index, start, end });
  }
  return spans;
}

function closestWord(words: WordRect[], x: number, y: number) {
  let best: WordRect | null = null;
  let bestDistance = Infinity;
  for (const word of words) {
    const dx = word.x + word.w / 2 - x;
    const dy = word.y + word.h / 2 - y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = word;
    }
  }
  return best;
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(query.matches);
    const onChange = () => setReduce(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduce;
}
