"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { composeBeat } from "@/lib/prompt";
import { PAGE_SIZE, useDesk } from "@/lib/store";
import {
  type AttentionBox,
  coversWord,
  nearestAnchor,
  paintAlpha,
  realizedSentences,
  vectorPaint,
  wordsOf,
} from "@/lib/text";

type WordRect = {
  line: number;
  word: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

type Drag =
  | { kind: "move"; id: string; dx: number; dy: number; x: number; y: number }
  | { kind: "weight"; id: string; startX: number; startWeight: number }
  | { kind: "select"; anchorLine: number; anchorWord: number; line: number; word: number };

const REALIZED_LABEL = { tono: "tono", foco: "foco", tension: "tensión" } as const;

export function Manuscript({ onHeight }: { onHeight: (index: number, height: number) => void }) {
  const lines = useDesk((state) => state.lines);
  const cursor = useDesk((state) => state.cursor);
  const freshIndex = useDesk((state) => state.freshIndex);
  const boxes = useDesk((state) => state.boxes);
  const selectedBoxId = useDesk((state) => state.selectedBoxId);
  const origins = useDesk((state) => state.origins);
  const page = useDesk((state) => state.page);
  const blocked = useDesk((state) => state.blocked);
  const toggleBlock = useDesk((state) => state.toggleBlock);
  const factors = useDesk((state) => state.factors);
  const activeFactor = useDesk((state) => state.activeFactor);
  const steers = useDesk((state) => state.steers);
  const plane = useDesk((state) => state.plane);
  const steering = useDesk((state) => state.steering);
  const steerMoved = useDesk((state) => state.steerMoved);
  const previews = useDesk((state) => state.previews);
  const anchors = useDesk((state) => state.anchors);
  const rewinding = useDesk((state) => state.rewinding);
  const checks = useDesk((state) => state.checks);
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
  const [drag, setDrag] = useState<Drag | null>(null);

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
    wordsRef.current = next;
    setWords((current) => (sameWords(current, next) ? current : next));
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
    settleFresh();
  }, [freshIndex, settleFresh]);

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
        if (target) moveBox(current.id, target.line, target.word);
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
      ? composeBeat({
          lines,
          cursor,
          boxes: previewBoxes,
          factors,
          docs,
          activeFactor,
          steers,
          variant,
        })
      : null;
  const paint = vectorPaint(plane.x, plane.y);
  const speculative =
    steering && steerMoved && previews.length > 0 ? previews[nearestAnchor(plane, anchors)] : undefined;
  const preview = speculative ?? beat?.sentence ?? null;
  const futureHere = cursor === 0 ? page === 0 : page === Math.floor((cursor - 1) / PAGE_SIZE);
  const pageStart = page * PAGE_SIZE;
  const pageEnd = Math.min(cursor, pageStart + PAGE_SIZE);
  const realized = realizedSentences(checks, pageStart, pageEnd);

  return (
    <div
      ref={contentRef}
      className="relative min-w-0 pb-80"
      title="Arrastrá de una palabra a otra para fijar atención. El circulito mezcla el vector. La barra de abajo rebobina o escribe."
    >
      <div className="h-8" />
      <AnimatePresence initial={false}>
        {lines.slice(pageStart, pageEnd).map((line, offset) => {
          const index = pageStart + offset;
          const onPageEnd = index === cursor - 1;
          const mark = realized.find((item) => item.index === index);
          return (
          <motion.div
            key={index}
            exit={{ opacity: 0 }}
            transition={{ duration: 0 }}
            data-row={index}
            className="flex items-start gap-3 py-px pr-4"
          >
            <button
              type="button"
              className={`mono w-6 shrink-0 text-right text-[11px] leading-[22px] tabular-nums ${blocked[index] ? "text-[#ff8a5a] underline decoration-[#ff8a5a]" : origins[index] === "mock" ? "text-[#ff8a5a]/80" : "text-white/30"}`}
              title={blocked[index] ? "Bloqueada: se queda aunque recortes" : "Bloquear esta línea"}
              onClick={() => toggleBlock(index)}
            >
              {index + 1}
            </button>
            <p className="mono min-w-0 flex-1 text-[13.5px] leading-[22px] tracking-[-0.01em] text-[#d4d4d4]">
              <LineWords
                line={line}
                index={index}
                boxes={boxes}
                pending={pending}
                selectedBoxId={selectedBoxId}
                accent={paint.color}
                onCreate={addBox}
                onDragStart={beginMove}
                onSelectStart={beginSelect}
                onExtend={extendTo}
              />
              {onPageEnd ? <span data-caret className="inline-block h-[1em] w-px align-middle" /> : null}
              {mark ? (
                <span
                  data-realized={mark.factor}
                  className="ml-2 text-[10px] whitespace-nowrap text-[#3ddc86]"
                  title={`Esta oración realizó ${REALIZED_LABEL[mark.factor]}`}
                >
                  ✓ {REALIZED_LABEL[mark.factor]}
                </span>
              ) : null}
            </p>
          </motion.div>
          );
        })}
      </AnimatePresence>
      {futureHere && preview && !rewinding ? (
        <div data-future className="flex items-start gap-3 py-px pr-4">
          <span className="mono w-6 shrink-0 text-right text-[11px] leading-[22px] text-[#ff8a5a]/70">+</span>
          <p
            className="mono min-w-0 flex-1 text-[13.5px] leading-[22px]"
            style={{
              color: steering && steerMoved ? paint.color : "rgba(255,255,255,0.35)",
              transition: "color 200ms ease",
            }}
          >
            {preview}
          </p>
        </div>
      ) : null}

      {boxes.map((box) => {
        const covered = words.filter((item) => item.line === box.lineIndex && coversWord(box, item.word));
        if (covered.length === 0) return null;
        if (drag?.kind === "move" && drag.id === box.id) return null;
        const hue = box.hue ?? paint.color;
        const left = Math.min(...covered.map((item) => item.x));
        const top = Math.min(...covered.map((item) => item.y));
        const right = Math.max(...covered.map((item) => item.x + item.w));
        const bottom = Math.max(...covered.map((item) => item.y + item.h));
        const word = covered[covered.length - 1];
        if (!word) return null;
        const selected = box.id === selectedBoxId;
        return (
          <div key={box.id}>
            <span
              className="pointer-events-none absolute rounded-[3px]"
              style={{
                left: left - 3,
                top: top - 1,
                width: right - left + 6,
                height: bottom - top + 2,
                backgroundColor: paintAlpha(hue, selected ? 0.2 : 0.12),
                border: `1px solid ${paintAlpha(hue, selected ? 0.85 : 0.45)}`,
                transition: "background-color 200ms ease, border-color 200ms ease",
              }}
            />
            {selected ? (
              <>
                <button
                  type="button"
                  aria-label="Quitar atención"
                  className="absolute z-20 flex h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-black text-[9px] leading-none"
                  style={{ left: word.x + word.w - 1, top: word.y - 1, borderColor: hue, color: hue }}
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
                  <span className="h-2 w-2 rounded-full" style={{ background: hue, boxShadow: `0 0 8px ${hue}` }} />
                </span>
              </>
            ) : null}
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
  accent,
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
  accent: string;
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
        const hue = box?.hue ?? accent;
        const pinned = Boolean(box && wordIndex === Math.max(box.wordStart, box.wordEnd));
        const selected = box?.id === selectedBoxId;
        const drafting = pending.some((span) => span.line === index && wordIndex >= span.start && wordIndex <= span.end);
        const lit = selected || drafting;
        const joined = wordIndex < words.length - 1 && ((box && coversWord(box, wordIndex + 1) && selected) || pending.some((span) => span.line === index && wordIndex + 1 >= span.start && wordIndex + 1 <= span.end));
        return (
          <span key={`${word}-${wordIndex}`}>
            <span
              role="button"
              tabIndex={0}
              aria-label={marked ? `Mover atención de ${word}` : `Fijar ${word}`}
              data-word-index={wordIndex}
              data-line={index}
              data-pin={pinned ? box?.id : undefined}
              data-pin-hue={pinned ? hue : undefined}
              className={`rounded-[2px] ${lit ? "bg-white text-black" : marked ? "cursor-grab touch-none" : "cursor-pointer"}`}
              style={{
                color: marked && !lit ? hue : undefined,
                backgroundColor: marked && !lit ? paintAlpha(hue, 0.22) : undefined,
                boxShadow: marked && !lit ? `inset 0 -1px 0 ${hue}` : undefined,
                padding: lit ? "0 1px" : undefined,
                transition: "color 200ms ease, background-color 200ms ease, box-shadow 200ms ease",
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
              {joined ? " " : ""}
            </span>
            {wordIndex < words.length - 1 && !joined ? " " : ""}
          </span>
        );
      })}
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
