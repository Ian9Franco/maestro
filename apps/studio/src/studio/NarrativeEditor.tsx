"use client";

import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import { Selection, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  contentOrEmpty,
  generatedIdsBetween,
  isFullyGenerated,
  readReferences,
  referenceConnected,
  snapToWord,
  wordAt,
} from "@/narrative/document";
import { createNarrativeExtensions, ghostPreviewKey } from "@/narrative/extensions";
import { REFERENCE_INTENTS, type ReferenceIntent } from "@/narrative/types";
import { contextWeights } from "@/narrative/weights";
import { MAX_LINES, PREVIEW_LINES } from "@/narrative/writer";

const LINE_HEIGHT = 25.5;

export type GeneratedBlock = { text: string; blockId: string; generationId: string };
export type Discarded = { text: string; ids: { blockId: string; generationId: string }[] };

type Point = { x: number; y: number; h: number };
type Layout = {
  caret: Point | null;
  blocks: { key: number; top: number; height: number; weight: number; referenced: boolean; after: boolean }[];
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
}) {
  const callbacks = useRef({ onChange, onCursor, onDragLines, onGenerate, onDiscard });
  callbacks.current = { onChange, onCursor, onDragLines, onGenerate, onDiscard };
  const cursorRef = useRef(initialCursor);
  const atEndRef = useRef(placeAtEnd);
  cursorRef.current = initialCursor;
  atEndRef.current = placeAtEnd;
  const placed = useRef(false);
  /** El cursor de antes del primer clic: un doble clic no mueve el punto de inserción. */
  const press = useRef<{ detail: number; cursor: number; live: boolean } | null>(null);
  const ghost = useRef<{ text: string; hidden: boolean } | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const runway = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ id: string; side: "start" | "end" } | null>(null);
  const [layout, setLayout] = useState<Layout>(EMPTY_LAYOUT);
  const [dragLines, setDragLines] = useState<number | null>(null);
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
            setGhostHidden(view, true);
            if (event.detail <= 1 || !press.current) {
              press.current = { detail: 1, cursor: view.state.selection.from, live: true };
            } else {
              press.current = { ...press.current, detail: event.detail, live: true };
            }
            return false;
          },
        },
        handleDoubleClick: (view, pos) => {
          const word = wordAt(view.state.doc, pos);
          if (!word) return false;
          const taken = readReferences(view.state.doc).some(
            (reference) => reference.anchorPos === null && reference.from < word.to && reference.to > word.from,
          );
          if (taken) return false;
          const mark = view.state.schema.marks.reference.create({ id: crypto.randomUUID(), intent: "hecho" });
          const tr = view.state.tr.addMark(word.from, word.to, mark);
          const back = press.current?.cursor ?? view.state.selection.from;
          tr.setSelection(Selection.near(tr.doc.resolve(Math.min(back, tr.doc.content.size))));
          view.dispatch(tr);
          return true;
        },
        handleKeyDown: (view, event) => {
          if (event.key !== "Tab" || event.shiftKey || !view.state.selection.empty) return false;
          event.preventDefault();
          generate(view, PREVIEW_LINES);
          return true;
        },
      },
      onUpdate: ({ editor: current }) => {
        callbacks.current.onChange(current.getJSON());
      },
      onSelectionUpdate: ({ editor: current }) => {
        callbacks.current.onCursor(current.state.selection.from);
      },
    },
    [projectId, extensions, content],
  );

  /** Mientras el mouse está apretado la propuesta no se dibuja: si no, empuja el texto que se está seleccionando. */
  function setGhostHidden(view: EditorView, hidden: boolean) {
    const storage = ghost.current;
    if (!storage || storage.hidden === hidden) return;
    storage.hidden = hidden;
    view.dispatch(view.state.tr.setMeta(ghostPreviewKey, hidden));
  }

  function generate(view: EditorView, lines: number) {
    const block = callbacks.current.onGenerate(lines);
    if (!block) return;
    insertGenerated(view, block);
    view.focus();
  }

  useEffect(() => {
    if (!editor || placed.current) return;
    placed.current = true;
    const stored = cursorRef.current;
    if (typeof stored === "number") {
      const max = editor.state.doc.content.size;
      editor.commands.setTextSelection(Math.max(0, Math.min(stored, max)));
    } else if (atEndRef.current) {
      editor.commands.focus("end");
    }
    callbacks.current.onCursor(editor.state.selection.from);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const storage = (editor.storage as { ghostPreview?: { text: string; hidden: boolean } }).ghostPreview;
    ghost.current = storage ?? null;
    if (!storage || storage.text === preview) return;
    storage.text = preview;
    editor.view.dispatch(editor.state.tr.setMeta(ghostPreviewKey, preview));
  }, [editor, preview]);

  useEffect(() => {
    if (!editor) return;
    const onUp = () => {
      const pressed = press.current;
      if (!pressed?.live) return;
      pressed.live = false;
      window.setTimeout(() => {
        if (editor.isDestroyed) return;
        if (pressed.detail === 1) discardSelection(editor.view);
        setGhostHidden(editor.view, false);
      }, 0);
    };
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, [editor]);

  function discardSelection(view: EditorView) {
    const { selection, doc } = view.state;
    if (selection.empty || !isFullyGenerated(doc, selection.from, selection.to)) return;
    callbacks.current.onDiscard({
      text: doc.textBetween(selection.from, selection.to, " "),
      ids: generatedIdsBetween(doc, selection.from, selection.to),
    });
    const tr = view.state.tr.delete(selection.from, selection.to);
    const at = tr.mapping.map(selection.from);
    const $at = tr.doc.resolve(at);
    if ($at.depth === 1 && $at.parent.content.size === 0 && tr.doc.childCount > 1) {
      tr.delete($at.before(), $at.after());
    }
    const safe = Math.max(0, Math.min(tr.mapping.map(selection.from, -1), tr.doc.content.size));
    tr.setSelection(Selection.near(tr.doc.resolve(safe), -1));
    view.dispatch(tr);
    view.focus();
  }

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

  function onRunwayDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!editor) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const lines = linesAt(event.clientY);
    setDragLines(lines);
    callbacks.current.onDragLines(lines);
  }

  function onRunwayMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragLines === null) return;
    const lines = linesAt(event.clientY);
    if (lines === dragLines) return;
    setDragLines(lines);
    callbacks.current.onDragLines(lines);
  }

  function onRunwayUp() {
    const lines = dragLines;
    setDragLines(null);
    callbacks.current.onDragLines(null);
    if (editor && lines) generate(editor.view, lines);
  }

  function onRunwayCancel() {
    setDragLines(null);
    callbacks.current.onDragLines(null);
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

  return (
    <div ref={wrapper} className="relative pl-10">
      <Gutter blocks={layout.blocks} />
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
            ? "Arrastrá sobre estos renglones para generar después del cursor."
            : `${dragLines} ${dragLines === 1 ? "renglón" : "renglones"} · soltá para generar`}
        </p>
      </div>
    </div>
  );
}

function Gutter({ blocks }: { blocks: Layout["blocks"] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute top-0 left-0 w-8">
      {blocks.map((block) => {
        const color = block.referenced ? "#9eb7ff" : "#ff8a5a";
        const alpha = block.after ? 0 : Math.max(0.12, block.weight / 10);
        return (
          <div
            key={block.key}
            className="absolute right-1 flex items-start gap-1"
            style={{ top: block.top, height: block.height }}
            title={block.after ? "Después del cursor: no se usa" : `Peso ${block.weight} de 10`}
          >
            <span className="w-4 pt-[3px] text-right text-[10px] tabular-nums" style={{ color, opacity: block.after ? 0.25 : alpha }}>
              {block.after ? "·" : block.weight}
            </span>
            <span
              className="h-full w-[3px] rounded-full"
              style={{
                background: block.after ? "rgba(255,255,255,0.08)" : color,
                opacity: block.after ? 1 : alpha,
              }}
            />
          </div>
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
    return [
      {
        key: weight.pos,
        top: rect.top - box.top,
        height: rect.height,
        weight: weight.weight,
        referenced: weight.referenced,
        after: weight.after,
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

function insertGenerated(view: EditorView, block: GeneratedBlock) {
  const { state } = view;
  const schema = state.schema;
  const mark = schema.marks.generated.create({ id: block.blockId, generationId: block.generationId });
  const pos = state.selection.from;
  const $pos = state.doc.resolve(pos);
  const tr = state.tr;
  let end: number;
  if ($pos.parent.isTextblock && $pos.parent.content.size === 0) {
    tr.insert(pos, schema.text(block.text, [mark]));
    end = pos + block.text.length;
  } else if ($pos.parent.isTextblock && $pos.parentOffset === $pos.parent.content.size && $pos.depth === 1) {
    const after = $pos.after();
    tr.insert(after, schema.nodes.paragraph.create(null, schema.text(block.text, [mark])));
    end = after + 1 + block.text.length;
  } else {
    const offset = $pos.parentOffset;
    const size = $pos.parent.content.size;
    const previous = offset > 0 ? $pos.parent.textBetween(offset - 1, offset, undefined, " ") : " ";
    const next = offset < size ? $pos.parent.textBetween(offset, offset + 1, undefined, " ") : " ";
    const text = `${/\s/.test(previous) ? "" : " "}${block.text}${/\s/.test(next) ? "" : " "}`;
    tr.insert(pos, schema.text(text, [mark]));
    end = pos + text.length;
  }
  tr.setSelection(TextSelection.create(tr.doc, end));
  view.dispatch(tr.scrollIntoView());
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
