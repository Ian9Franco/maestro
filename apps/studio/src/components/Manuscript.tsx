"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDesk } from "@/lib/store";
import { wordsOf } from "@/lib/text";

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
  | { kind: "weight"; id: string; startX: number; startWeight: number };

export function Manuscript({ onHeight }: { onHeight: (index: number, height: number) => void }) {
  const lines = useDesk((state) => state.lines);
  const cursor = useDesk((state) => state.cursor);
  const freshIndex = useDesk((state) => state.freshIndex);
  const boxes = useDesk((state) => state.boxes);
  const selectedBoxId = useDesk((state) => state.selectedBoxId);
  const checks = useDesk((state) => state.checks);
  const addBox = useDesk((state) => state.addBox);
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
  const [snapping, setSnapping] = useState(false);

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
    function move(event: PointerEvent) {
      const current = dragRef.current;
      if (!current) return;
      if (current.kind === "move") {
        const next = { ...current, x: event.clientX - current.dx, y: event.clientY - current.dy };
        dragRef.current = next;
        setDrag(next);
        return;
      }
      setBoxWeight(current.id, current.startWeight + (event.clientX - current.startX) / 140);
    }
    function up(event: PointerEvent) {
      const current = dragRef.current;
      if (!current) return;
      dragRef.current = null;
      if (current.kind === "move") {
        const content = contentRef.current;
        if (content) {
          const origin = content.getBoundingClientRect();
          const target = closestWord(
            wordsRef.current,
            event.clientX - origin.left,
            event.clientY - origin.top,
          );
          if (target) moveBox(current.id, target.line, target.word);
        }
        setSnapping(true);
        window.setTimeout(() => setSnapping(false), 200);
      }
      setDrag(null);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [moveBox, setBoxWeight]);

  return (
    <div ref={contentRef} className="relative min-w-0 flex-1 pb-8">
      <div className="flex h-16 items-end px-14 pb-2 text-xs text-white/35">
        Doble clic en una palabra para fijar la atención.
      </div>
      <AnimatePresence initial={false}>
        {lines.slice(0, cursor).map((line, index) => (
          <motion.div
            key={index}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            data-row={index}
            className="flex items-start gap-4 px-2 py-2"
          >
            <span className="mono w-8 shrink-0 pt-0.5 text-right text-xs text-white/30">
              {index + 1}
            </span>
            <p className="mono text-[15px] leading-7 text-zinc-100">
              {freshIndex === index ? (
                <TypedLine text={line} onDone={settleFresh} />
              ) : (
                <LineWords line={line} index={index} boxes={boxes} onCreate={addBox} />
              )}
              <Checks hits={checks[index]} />
            </p>
          </motion.div>
        ))}
      </AnimatePresence>

      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {boxes.map((box) => {
          const word = words.find((item) => item.line === box.lineIndex && item.word === box.wordIndex);
          if (!word || drag?.kind === "move" && drag.id === box.id) return null;
          const x2 = word.x + word.w / 2;
          const y2 = word.y;
          const x1 = word.x + 8;
          const y1 = word.y - 2;
          return (
            <line
              key={box.id}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(186, 220, 255, 0.7)"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
          );
        })}
      </svg>

      {boxes.map((box) => {
        const word = words.find((item) => item.line === box.lineIndex && item.word === box.wordIndex);
        if (!word) return null;
        const moving = drag?.kind === "move" && drag.id === box.id;
        const left = moving ? drag.x - (contentRef.current?.getBoundingClientRect().left ?? 0) : word.x;
        const top = moving ? drag.y - (contentRef.current?.getBoundingClientRect().top ?? 0) : word.y - 16;
        const selected = box.id === selectedBoxId;
        return (
          <div
            key={box.id}
            className="absolute z-10"
              style={{
              left: left - 4,
              top,
              width: word.w + 8,
              transition: snapping && !moving ? "left 200ms cubic-bezier(0.2, 1.3, 0.3, 1), top 200ms cubic-bezier(0.2, 1.3, 0.3, 1)" : "none",
            }}
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).dataset.handle === "weight") return;
              event.stopPropagation();
              selectBox(box.id);
              const rect = event.currentTarget.getBoundingClientRect();
              const next: Drag = {
                kind: "move",
                id: box.id,
                dx: event.clientX - rect.left,
                dy: event.clientY - rect.top,
                x: rect.left,
                y: rect.top,
              };
              dragRef.current = next;
              setDrag(next);
            }}
          >
            <div className="mb-0.5 text-[10px] leading-none text-sky-100/90">Atención: {box.weight.toFixed(1)}</div>
            <div
              className="relative rounded-sm border bg-sky-200/10"
              style={{
                height: Math.max(word.h, 22),
                borderColor: selected ? "rgba(220,240,255,0.95)" : "rgba(170,210,255,0.65)",
              }}
            >
              <button
                type="button"
                aria-label="Quitar caja"
                className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-[10px] text-white"
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
                className="absolute right-0 bottom-0 h-2.5 w-2.5 cursor-ew-resize bg-sky-100"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  const next: Drag = {
                    kind: "weight",
                    id: box.id,
                    startX: event.clientX,
                    startWeight: box.weight,
                  };
                  dragRef.current = next;
                  setDrag(next);
                }}
              />
            </div>
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
  onCreate,
}: {
  line: string;
  index: number;
  boxes: { lineIndex: number; wordIndex: number }[];
  onCreate: (lineIndex: number, wordIndex: number) => void;
}) {
  const words = wordsOf(line);
  return (
    <>
      {words.map((word, wordIndex) => {
        const marked = boxes.some((box) => box.lineIndex === index && box.wordIndex === wordIndex);
        return (
          <span key={`${word}-${wordIndex}`}>
            <span
              role="button"
              tabIndex={0}
              aria-label={`Fijar ${word}`}
              data-word-index={wordIndex}
              data-line={index}
              className="cursor-pointer rounded-sm"
              style={{ background: marked ? "rgba(140, 200, 255, 0.22)" : undefined }}
              onDoubleClick={() => onCreate(index, wordIndex)}
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

function Checks({ hits }: { hits?: { tono: boolean; tension: boolean; foco: boolean } }) {
  if (!hits) return null;
  const marks = [
    hits.tono ? "tono" : null,
    hits.tension ? "tensión" : null,
    hits.foco ? "foco" : null,
  ].filter((mark): mark is string => Boolean(mark));
  if (marks.length === 0) return null;
  return (
    <span className="ml-2 inline-flex gap-1 align-middle">
      {marks.map((mark) => (
        <span key={mark} title={mark} className="text-[11px] text-emerald-400">
          ✓
        </span>
      ))}
    </span>
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
