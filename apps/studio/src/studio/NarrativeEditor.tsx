"use client";

import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  contentOrEmpty,
  endOfBlock,
  eraseGenerated,
  placeGenerated,
  readReferences,
  referenceConnected,
  snapToWord,
  tokenAt,
} from "@/narrative/document";
import { emotionOf } from "@/narrative/emotion";
import { createNarrativeExtensions, ghostPreviewKey } from "@/narrative/extensions";
import { REFERENCE_INTENTS, type ReferenceIntent } from "@/narrative/types";
import { contextWeights } from "@/narrative/weights";
import { MAX_LINES, PREVIEW_LINES } from "@/narrative/writer";

const LINE_HEIGHT = 25.5;

export type GeneratedBlock = { text: string; blockId: string; generationId: string };
export type Discarded = { text: string; ids: { blockId: string; generationId: string }[] };

type Point = { x: number; y: number; h: number };
type Mood = "generar" | "contexto";

type Layout = {
  caret: Point | null;
  blocks: {
    key: number;
    pos: number;
    top: number;
    height: number;
    weight: number;
    referenced: boolean;
    after: boolean;
    color: string;
    emotion: string;
  }[];
  references: { id: string; intent: ReferenceIntent; connected: boolean; start: Point; end: Point }[];
};

const EMPTY_LAYOUT: Layout = { caret: null, blocks: [], references: [] };

export function NarrativeEditor({
  projectId,
  initial,
  initialCursor,
  placeAtEnd,
  preview,
  onChange,
  onCursor,
  onDragLines,
  onGenerate,
  onDiscard,
  onMood,
}: {
  projectId: string;
  initial: JSONContent;
  initialCursor: number | null;
  placeAtEnd: boolean;
  preview: string;
  onChange: (document: JSONContent) => void;
  onCursor: (cursor: number) => void;
  onDragLines: (lines: number | null) => void;
  onGenerate: (lines: number) => GeneratedBlock | null;
  onDiscard: (discarded: Discarded) => void;
  onMood?: (mood: "generar" | "contexto") => void;
}) {
  const callbacks = useRef({ onChange, onCursor, onDragLines, onGenerate, onDiscard, onMood });
  callbacks.current = { onChange, onCursor, onDragLines, onGenerate, onDiscard, onMood };
  const cursorRef = useRef(initialCursor);
  const atEndRef = useRef(placeAtEnd);
  cursorRef.current = initialCursor;
  atEndRef.current = placeAtEnd;
  const placed = useRef(false);
  /**
   * El punto de inserción no sigue al clic. Se queda donde se generó por última vez
   * y solo se mueve al generar, al borrar o al elegir una barra.
   */
  const insertion = useRef<number | null>(initialCursor);
  const moving = useRef(false);
  const moodRef = useRef<Mood>("generar");
  const gesture = useRef<{ x: number; y: number; pos: number; moved: boolean } | null>(null);
  const armed = useRef<{ from: number; to: number } | null>(null);
  const draftId = useRef<string | null>(null);
  const pendingErase = useRef<{ text: string; ids: Discarded["ids"] } | null>(null);
  const acceptRef = useRef<number | null>(null);
  const ghostDrag = useRef(false);
  const ghost = useRef<{ text: string; hidden: boolean; accept: number } | null>(null);
  const [mood, setMoodState] = useState<Mood>("generar");
  const wrapper = useRef<HTMLDivElement>(null);
  const runway = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ id: string; side: "start" | "end" } | null>(null);
  const [layout, setLayout] = useState<Layout>(EMPTY_LAYOUT);
  const [dragLines, setDragLines] = useState<number | null>(null);

  function setMood(next: Mood) {
    moodRef.current = next;
    setMoodState(next);
    if (next === "generar") draftId.current = null;
    callbacks.current.onMood?.(next);
  }
  const [extensions] = useState(createNarrativeExtensions);
  const [content] = useState(() => contentOrEmpty(initial));

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      content,
      editorProps: {
        attributes: {
          class: "narrative-editor",
          "aria-label": "Manuscrito",
          spellcheck: "true",
        },
        handleDOMEvents: {
          mousedown: (view, event) => {
            if (ghostDrag.current) return true;
            const target = eventTarget(event);
            if (target?.closest(".ghost-sentence, .reference-handle, button")) return true;
            event.preventDefault();
            view.focus();
            const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!hit) return true;
            if (event.detail >= 2) {
              enterContext(view, hit.pos);
              return true;
            }
            gesture.current = { x: event.clientX, y: event.clientY, pos: hit.pos, moved: false };
            return true;
          },
        },
        handleDoubleClick: () => true,
        handleKeyDown: (view, event) => {
          if (event.key === "Escape") {
            setMood("generar");
            return true;
          }
          if (event.key !== "Tab" || event.shiftKey) return false;
          event.preventDefault();
          if (moodRef.current === "contexto") return true;
          generate(view, PREVIEW_LINES);
          return true;
        },
      },
      onUpdate: ({ editor: current }) => {
        callbacks.current.onChange(current.getJSON());
      },
      onSelectionUpdate: ({ editor: current }) => {
        const at = insertion.current;
        if (at == null || moving.current) return;
        const selection = current.state.selection;
        if (selection.empty && selection.from === at) return;
        moving.current = true;
        const safe = Math.max(0, Math.min(at, current.state.doc.content.size));
        current.commands.setTextSelection(safe);
        moving.current = false;
      },
    },
    [projectId, extensions, content],
  );

  function generate(view: EditorView, lines: number) {
    if (moodRef.current === "contexto") return;
    const block = callbacks.current.onGenerate(lines);
    if (!block) return;
    const at = insertion.current ?? view.state.selection.from;
    const placed = placeGenerated(view.state.doc, at, block.text, block.blockId, block.generationId);
    applyDoc(view, placed.doc, placed.cursor);
    view.focus();
  }

  function applyDoc(view: EditorView, doc: EditorView["state"]["doc"], cursor: number) {
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
    const safe = Math.max(0, Math.min(cursor, tr.doc.content.size));
    moving.current = true;
    tr.setSelection(TextSelection.create(tr.doc, safe));
    view.dispatch(tr);
    moving.current = false;
    insertion.current = view.state.selection.from;
    callbacks.current.onCursor(insertion.current);
  }

  function enterContext(view: EditorView, pos: number) {
    setMood("contexto");
    const token = tokenAt(view.state.doc, pos);
    armed.current = token;
    if (token) paintReference(view, crypto.randomUUID(), token.from, token.to);
  }

  function armContext(view: EditorView, pos: number) {
    const token = tokenAt(view.state.doc, pos);
    if (!token) return;
    const previous = armed.current;
    const same = previous !== null && token.from < previous.to && token.to > previous.from;
    armed.current = token;
    if (same) paintReference(view, crypto.randomUUID(), token.from, token.to);
  }

  function paintReference(view: EditorView, id: string, from: number, to: number) {
    const { state } = view;
    const current = readReferences(state.doc).find((item) => item.id === id);
    const mark = state.schema.marks.reference.create({ id, intent: current?.intent ?? "hecho" });
    const tr = state.tr;
    if (current) tr.removeMark(current.from, current.to, mark);
    tr.addMark(from, to, mark);
    moving.current = true;
    const at = insertion.current ?? state.selection.from;
    tr.setSelection(TextSelection.create(tr.doc, Math.max(0, Math.min(at, tr.doc.content.size))));
    view.dispatch(tr);
    moving.current = false;
  }

  /** Borra lo generado entre el inicio del arrastre y el puntero, en el documento de ahora. */
  function sweep(view: EditorView, anchor: number, pointer: number): number {
    const result = eraseGenerated(view.state.doc, anchor, pointer);
    if (!result) return anchor;
    const pending = pendingErase.current ?? { text: "", ids: [] };
    pending.text = `${pending.text} ${result.text}`.trim();
    pending.ids = [...pending.ids, ...result.ids];
    pendingErase.current = pending;
    applyDoc(view, result.doc, result.map(insertion.current ?? anchor));
    return result.map(Math.min(anchor, pointer));
  }

  useEffect(() => {
    if (!editor || placed.current) return;
    placed.current = true;
    const stored = cursorRef.current;
    moving.current = true;
    if (typeof stored === "number") {
      const max = editor.state.doc.content.size;
      editor.commands.setTextSelection(Math.max(0, Math.min(stored, max)));
    } else if (atEndRef.current) {
      editor.commands.focus("end");
    }
    moving.current = false;
    insertion.current = editor.state.selection.from;
    callbacks.current.onCursor(insertion.current);
    callbacks.current.onMood?.("generar");
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const storage = (editor.storage as { ghostPreview?: { text: string; hidden: boolean; accept: number } }).ghostPreview;
    ghost.current = storage ?? null;
    if (!storage) return;
    const hidden = mood === "contexto";
    const accept = dragLines ?? 0;
    if (storage.text === preview && storage.hidden === hidden && storage.accept === accept) return;
    storage.text = preview;
    storage.hidden = hidden;
    storage.accept = accept;
    editor.view.dispatch(editor.state.tr.setMeta(ghostPreviewKey, preview));
  }, [editor, preview, dragLines, mood]);

  useEffect(() => {
    if (!editor) return;
    const onMove = (event: PointerEvent) => {
      const active = gesture.current;
      if (!active) return;
      if (Math.hypot(event.clientX - active.x, event.clientY - active.y) < 5) return;
      active.moved = true;
      const hit = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (!hit) return;
      if (moodRef.current === "generar") {
        active.pos = sweep(editor.view, active.pos, hit.pos);
        return;
      }
      const start = tokenAt(editor.view.state.doc, active.pos);
      const end = tokenAt(editor.view.state.doc, hit.pos);
      if (!start || !end) return;
      draftId.current ??= crypto.randomUUID();
      paintReference(editor.view, draftId.current, Math.min(start.from, end.from), Math.max(start.to, end.to));
    };
    const onUp = () => {
      const active = gesture.current;
      gesture.current = null;
      if (!active || editor.isDestroyed) return;
      const pending = pendingErase.current;
      pendingErase.current = null;
      if (pending && pending.text) callbacks.current.onDiscard(pending);
      if (active.moved) {
        draftId.current = null;
        return;
      }
      if (moodRef.current === "contexto") armContext(editor.view, active.pos);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (wrapper.current && !editor.isDestroyed) setLayout(measure(editor.view, wrapper.current));
      });
    };
    schedule();
    editor.on("transaction", schedule);
    window.addEventListener("resize", schedule);
    void document.fonts?.ready.then(schedule);
    return () => {
      cancelAnimationFrame(frame);
      editor.off("transaction", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [editor]);

  function linesAt(clientY: number): number {
    const box = runway.current?.getBoundingClientRect();
    if (!box) return 1;
    return Math.max(1, Math.min(MAX_LINES, Math.ceil((clientY - box.top) / LINE_HEIGHT)));
  }

  function setAccept(lines: number | null) {
    acceptRef.current = lines;
    setDragLines(lines);
    callbacks.current.onDragLines(lines);
  }

  function onRunwayDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!editor || moodRef.current === "contexto") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setAccept(linesAt(event.clientY));
  }

  function onRunwayMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (acceptRef.current === null) return;
    const lines = linesAt(event.clientY);
    if (lines === acceptRef.current) return;
    setAccept(lines);
  }

  function onRunwayUp() {
    const lines = acceptRef.current;
    setAccept(null);
    if (editor && lines) generate(editor.view, lines);
  }

  function onRunwayCancel() {
    setAccept(null);
  }

  function placeAt(pos: number) {
    if (!editor) return;
    const edge = endOfBlock(editor.state.doc, pos);
    moving.current = true;
    editor.commands.setTextSelection(Math.max(0, Math.min(edge, editor.state.doc.content.size)));
    moving.current = false;
    insertion.current = editor.state.selection.from;
    callbacks.current.onCursor(insertion.current);
    setMood("generar");
  }

  function startResize(event: ReactPointerEvent<HTMLElement>, id: string, side: "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizing.current = { id, side };
  }

  function moveResize(event: ReactPointerEvent<HTMLElement>) {
    const active = resizing.current;
    if (!active || !editor) return;
    const hit = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (hit) resizeReference(editor.view, active.id, active.side, hit.pos);
  }

  function endResize() {
    resizing.current = null;
  }

  useEffect(() => {
    const root = wrapper.current;
    if (!root || !editor) return;
    let dragging = false;
    const indexAt = (event: PointerEvent) => {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const sentence = element?.closest(".ghost-sentence");
      if (!(sentence instanceof HTMLElement)) return null;
      return Number(sentence.dataset.ghostIndex ?? 0) + 1;
    };
    const onDown = (event: PointerEvent) => {
      const target = eventTarget(event);
      if (!target?.closest(".ghost-sentence") || moodRef.current === "contexto") return;
      event.preventDefault();
      event.stopPropagation();
      ghostDrag.current = true;
      dragging = true;
      const lines = indexAt(event);
      if (lines) setAccept(lines);
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging) return;
      const lines = indexAt(event);
      if (lines) setAccept(lines);
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      ghostDrag.current = false;
      const lines = acceptRef.current;
      setAccept(null);
      if (lines) generate(editor.view, lines);
    };
    root.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      root.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, [editor]);

  return (
    <div ref={wrapper} className="relative pl-10" data-mood={mood}>
      <div className="mb-3 flex items-center gap-2">
        <button type="button" aria-pressed={mood === "generar"} className="mood-button" onClick={() => setMood("generar")}>
          Generar
        </button>
        <button type="button" aria-pressed={mood === "contexto"} className="mood-button" onClick={() => setMood("contexto")}>
          Contexto
        </button>
        <span className="text-[11px] text-white/40">
          {mood === "generar"
            ? "Arrastrá el texto gris para aceptar hasta ahí. Arrastrar texto generado lo borra."
            : "Sin propuesta. Un clic elige el lugar, el siguiente lo marca. Esc vuelve a generar."}
        </span>
      </div>
      <Gutter blocks={layout.blocks} onPlace={placeAt} />
      <Connectors layout={layout} />
      <EditorContent editor={editor} />
      {layout.references.map((reference) => (
        <ReferenceHandles
          key={reference.id}
          reference={reference}
          onStart={startResize}
          onMove={moveResize}
          onEnd={endResize}
          onIntent={() => editor && cycleIntent(editor.view, reference.id)}
          onRemove={() => editor && removeReference(editor.view, reference.id)}
        />
      ))}
      <div
        ref={runway}
        role="slider"
        aria-label="Renglones vacíos: arrastrá hacia abajo para generar después del cursor"
        aria-valuemin={0}
        aria-valuemax={MAX_LINES}
        aria-valuenow={dragLines ?? 0}
        tabIndex={-1}
        className="runway mt-2 cursor-row-resize touch-none select-none"
        onPointerDown={onRunwayDown}
        onPointerMove={onRunwayMove}
        onPointerUp={onRunwayUp}
        onPointerCancel={onRunwayCancel}
      >
        {Array.from({ length: MAX_LINES }, (_, index) => (
          <div key={index} className="runway-line" data-on={dragLines !== null && index < dragLines ? "" : undefined} />
        ))}
        <p className="runway-label">
          {dragLines === null
            ? "O arrastrá acá: cada renglón es una oración de la propuesta."
            : `${dragLines} ${dragLines === 1 ? "oración" : "oraciones"} · soltá para generar`}
        </p>
      </div>
    </div>
  );
}

function Gutter({ blocks, onPlace }: { blocks: Layout["blocks"]; onPlace: (pos: number) => void }) {
  return (
    <div className="absolute top-0 left-0 w-8">
      {blocks.map((block) => {
        const count = block.after ? 1 : Math.max(block.weight, 1);
        return (
          <button
            key={block.key}
            type="button"
            className="emotion-stack"
            style={{ top: block.top, height: block.height }}
            title={
              block.after
                ? "Después del punto de inserción: no se usa"
                : `${block.emotion} · peso ${block.weight}. Clic para continuar desde este párrafo.`
            }
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPlace(block.pos)}
          >
            {Array.from({ length: count }, (_, index) => (
              <i
                key={index}
                className="emotion-tick"
                style={{
                  background: block.after ? "rgba(255,255,255,0.22)" : block.color,
                  opacity: block.after ? 0.35 : 0.35 + ((index + 1) / count) * 0.65,
                }}
              />
            ))}
          </button>
        );
      })}
    </div>
  );
}

function Connectors({ layout }: { layout: Layout }) {
  const caret = layout.caret;
  if (!caret) return null;
  const connected = layout.references.filter((reference) => reference.connected);
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      {connected.map((reference) => {
        const fromX = reference.end.x + 4;
        const fromY = reference.end.y + reference.end.h / 2;
        const toX = caret.x;
        const toY = caret.y + caret.h / 2;
        const bend = Math.max(40, Math.abs(toY - fromY) / 2);
        return (
          <path
            key={reference.id}
            d={`M ${fromX} ${fromY} C ${fromX + bend} ${fromY}, ${toX + bend} ${toY}, ${toX} ${toY}`}
            fill="none"
            stroke="#9eb7ff"
            strokeOpacity={0.55}
            strokeWidth={1.25}
            strokeDasharray="3 3"
          />
        );
      })}
      {connected.length > 0 ? <circle cx={caret.x} cy={caret.y + caret.h / 2} r={3} fill="#9eb7ff" /> : null}
    </svg>
  );
}

function ReferenceHandles({
  reference,
  onStart,
  onMove,
  onEnd,
  onIntent,
  onRemove,
}: {
  reference: Layout["references"][number];
  onStart: (event: ReactPointerEvent<HTMLElement>, id: string, side: "start" | "end") => void;
  onMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onEnd: () => void;
  onIntent: () => void;
  onRemove: () => void;
}) {
  const handle = "reference-handle absolute w-2 cursor-col-resize touch-none";
  return (
    <>
      <span
        role="button"
        aria-label="Estirar la referencia hacia atrás"
        className={handle}
        style={{ left: reference.start.x - 5, top: reference.start.y - 3, height: reference.start.h + 6 }}
        onPointerDown={(event) => onStart(event, reference.id, "start")}
        onPointerMove={onMove}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
      />
      <span
        role="button"
        aria-label="Estirar la referencia hacia adelante"
        className={handle}
        style={{ left: reference.end.x - 3, top: reference.end.y - 3, height: reference.end.h + 6 }}
        onPointerDown={(event) => onStart(event, reference.id, "end")}
        onPointerMove={onMove}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
      />
      <span
        className="absolute flex -translate-y-full items-center gap-1 rounded bg-black/80 px-1 text-[10px] text-[#9eb7ff]"
        style={{ left: reference.end.x - 4, top: reference.end.y - 4 }}
      >
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onIntent} title="Cambiar intención">
          {reference.intent}
        </button>
        <button
          type="button"
          aria-label="Quitar referencia"
          className="text-white/50"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRemove}
        >
          ×
        </button>
      </span>
    </>
  );
}

function measure(view: EditorView, wrapper: HTMLElement): Layout {
  const box = wrapper.getBoundingClientRect();
  const { doc, selection } = view.state;
  const cursor = selection.from;
  const point = (pos: number, side: -1 | 1): Point | null => {
    try {
      const coords = view.coordsAtPos(pos, side);
      return { x: coords.left - box.left, y: coords.top - box.top, h: coords.bottom - coords.top };
    } catch {
      return null;
    }
  };
    const blocks = contextWeights(doc, cursor).flatMap((weight) => {
    const dom = view.nodeDOM(weight.pos);
    if (!(dom instanceof HTMLElement)) return [];
    const rect = dom.getBoundingClientRect();
    const emotion = emotionOf(doc.nodeAt(weight.pos)?.textContent ?? "");
    return [
      {
        key: weight.pos,
        pos: weight.pos,
        top: rect.top - box.top,
        height: rect.height,
        weight: weight.weight,
        referenced: weight.referenced,
        after: weight.after,
        color: weight.referenced ? "#9eb7ff" : emotion.color,
        emotion: weight.referenced ? "Referencia" : emotion.name,
      },
    ];
  });
  const references = readReferences(doc).flatMap((reference) => {
    if (!reference.text.trim() || reference.anchorPos !== null) return [];
    const start = point(reference.from, 1);
    const end = point(reference.to, -1);
    if (!start || !end) return [];
    return [
      {
        id: reference.id,
        intent: reference.intent,
        connected: referenceConnected(doc, cursor, reference),
        start,
        end,
      },
    ];
  });
  return { caret: point(cursor, -1), blocks, references };
}

function eventTarget(event: Event): Element | null {
  const target = event.target;
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function resizeReference(view: EditorView, id: string, side: "start" | "end", pos: number) {
  const { state } = view;
  const reference = readReferences(state.doc).find((item) => item.id === id);
  if (!reference) return;
  const snapped = snapToWord(state.doc, pos, side);
  let from = reference.from;
  let to = reference.to;
  if (side === "start") from = Math.min(snapped, to - 1);
  else to = Math.max(snapped, from + 1);
  if (from === reference.from && to === reference.to) return;
  const mark = state.schema.marks.reference.create({ id, intent: reference.intent });
  view.dispatch(state.tr.removeMark(reference.from, reference.to, mark).addMark(from, to, mark));
}

function cycleIntent(view: EditorView, id: string) {
  const { state } = view;
  const reference = readReferences(state.doc).find((item) => item.id === id);
  if (!reference) return;
  const index = REFERENCE_INTENTS.indexOf(reference.intent);
  const intent = REFERENCE_INTENTS[(index + 1) % REFERENCE_INTENTS.length]!;
  const old = state.schema.marks.reference.create({ id, intent: reference.intent });
  const next = state.schema.marks.reference.create({ id, intent });
  view.dispatch(state.tr.removeMark(reference.from, reference.to, old).addMark(reference.from, reference.to, next));
}

function removeReference(view: EditorView, id: string) {
  const { state } = view;
  const reference = readReferences(state.doc).find((item) => item.id === id);
  if (!reference) return;
  const mark = state.schema.marks.reference.create({ id, intent: reference.intent });
  view.dispatch(state.tr.removeMark(reference.from, reference.to, mark));
}
