import { getSchema, type JSONContent } from "@tiptap/core";
import { Node as ProseNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { createNarrativeExtensions } from "./extensions";
import { EMPTY_DOCUMENT, isReferenceIntent, type ReferenceIntent } from "./types";

let schemaCache: ReturnType<typeof getSchema> | null = null;

export function narrativeSchema() {
  schemaCache ??= getSchema(createNarrativeExtensions());
  return schemaCache;
}

export function documentFromJSON(json: JSONContent): ProseNode {
  return ProseNode.fromJSON(narrativeSchema(), json);
}

export function contentOrEmpty(json: JSONContent): JSONContent {
  try {
    documentFromJSON(json);
    return json;
  } catch {
    return EMPTY_DOCUMENT;
  }
}

export function docWithParagraph(text: string): ProseNode {
  const schema = narrativeSchema();
  return schema.node("doc", null, [schema.node("paragraph", null, text ? [schema.text(text)] : [])]);
}

export function insertText(doc: ProseNode, pos: number, text: string): ProseNode {
  return EditorState.create({ doc }).tr.insertText(text, pos).doc;
}

export function markGenerated(doc: ProseNode, from: number, to: number, id: string, generationId: string): ProseNode {
  const mark = doc.type.schema.marks.generated.create({ id, generationId });
  return EditorState.create({ doc }).tr.addMark(from, to, mark).doc;
}

export function addReference(
  doc: ProseNode,
  sourceFrom: number,
  sourceTo: number,
  anchorAt: number,
  intent: ReferenceIntent,
  referenceId: string,
  anchorId: string,
): ProseNode {
  const schema = doc.type.schema;
  const tr = EditorState.create({ doc }).tr;
  tr.addMark(sourceFrom, sourceTo, schema.marks.reference.create({ id: referenceId, intent }));
  const at = tr.mapping.map(anchorAt);
  tr.insert(at, schema.nodes.referenceAnchor.create({ id: anchorId, referenceId }));
  return tr.doc;
}

/** Referencia sin ancla: sigue al punto de inserción, esté donde esté. */
export function connectReference(
  doc: ProseNode,
  from: number,
  to: number,
  intent: ReferenceIntent,
  referenceId: string,
): ProseNode {
  const mark = doc.type.schema.marks.reference.create({ id: referenceId, intent });
  return EditorState.create({ doc }).tr.addMark(from, to, mark).doc;
}

export function referenceConnected(doc: ProseNode, cursor: number, reference: LiveReference): boolean {
  if (reference.text.trim().length === 0) return false;
  if (reference.anchorPos === null) return true;
  return sameBlock(doc, cursor, reference.anchorPos);
}

const WORD_CHAR = /[\p{L}\p{N}'’-]/u;

export type ContextToken = { from: number; to: number; kind: "palabra" | "espacio" | "letra" };

/** Lo que un segundo clic toma: la palabra, el espacio, o una sola letra. */
export function tokenAt(doc: ProseNode, pos: number): ContextToken | null {
  const safe = Math.max(0, Math.min(pos, doc.content.size));
  const resolved = doc.resolve(safe);
  if (!resolved.parent.isTextblock) return null;
  const text = resolved.parent.textBetween(0, resolved.parent.content.size, undefined, "\ufffc");
  if (text.length === 0) return null;
  const offset = Math.min(resolved.parentOffset, text.length - 1);
  const char = text[offset] ?? "";
  const base = resolved.start();
  if (WORD_CHAR.test(char)) {
    const word = wordAt(doc, base + offset);
    return word ? { ...word, kind: "palabra" } : null;
  }
  if (/\s/u.test(char)) return { from: base + offset, to: base + offset + 1, kind: "espacio" };
  return { from: base + offset, to: base + offset + 1, kind: "letra" };
}

/** El final del párrafo que contiene la posición. Generar nunca parte una palabra. */
export function endOfBlock(doc: ProseNode, pos: number): number {
  const safe = Math.max(0, Math.min(pos, doc.content.size));
  const resolved = doc.resolve(safe);
  if (!resolved.parent.isTextblock || resolved.depth < 1) return doc.content.size;
  return resolved.end();
}

/**
 * El texto nuevo entra en su propio párrafo, después del bloque del punto de inserción.
 * Aunque el punto caiga en medio de una palabra, no se intercala.
 */
export function placeGenerated(
  doc: ProseNode,
  at: number,
  text: string,
  blockId: string,
  generationId: string,
): { doc: ProseNode; cursor: number } {
  const schema = doc.type.schema;
  const mark = schema.marks.generated.create({ id: blockId, generationId });
  const tr = EditorState.create({ doc }).tr;
  const edge = endOfBlock(doc, at);
  const $edge = tr.doc.resolve(Math.max(0, Math.min(edge, tr.doc.content.size)));
  if (!$edge.parent.isTextblock || $edge.depth < 1) {
    const paragraph = schema.nodes.paragraph.create(null, schema.text(text, [mark]));
    tr.insert(tr.doc.content.size, paragraph);
    return { doc: tr.doc, cursor: tr.doc.content.size - 1 };
  }
  if ($edge.parent.content.size === 0) {
    tr.insert($edge.pos, schema.text(text, [mark]));
    return { doc: tr.doc, cursor: $edge.pos + text.length };
  }
  const after = $edge.after();
  tr.insert(after, schema.nodes.paragraph.create(null, schema.text(text, [mark])));
  return { doc: tr.doc, cursor: after + 1 + text.length };
}

export function generatedSlices(doc: ProseNode, from: number, to: number): { from: number; to: number }[] {
  const max = doc.content.size;
  const start = Math.max(0, Math.min(from, to, max));
  const end = Math.min(max, Math.max(from, to));
  if (end <= start) return [];
  const slices: { from: number; to: number }[] = [];
  doc.nodesBetween(start, end, (node, pos) => {
    if (!node.isText || !node.marks.some((mark) => mark.type.name === "generated")) return;
    const sliceFrom = Math.max(start, pos);
    const sliceTo = Math.min(end, pos + node.nodeSize);
    if (sliceTo <= sliceFrom) return;
    const last = slices[slices.length - 1];
    if (last && last.to === sliceFrom) last.to = sliceTo;
    else slices.push({ from: sliceFrom, to: sliceTo });
  });
  return slices;
}

/** Borra solo el texto generado del rango. Lo escrito a mano queda. */
export function eraseGenerated(
  doc: ProseNode,
  from: number,
  to: number,
): { doc: ProseNode; text: string; ids: { blockId: string; generationId: string }[]; map: (pos: number) => number } | null {
  const slices = generatedSlices(doc, from, to);
  if (slices.length === 0) return null;
  const text = slices.map((slice) => doc.textBetween(slice.from, slice.to, " ")).join(" ");
  const ids = generatedIdsBetween(doc, slices[0]!.from, slices[slices.length - 1]!.to);
  const tr = EditorState.create({ doc }).tr;
  for (const slice of [...slices].reverse()) tr.delete(slice.from, slice.to);
  const empty: { from: number; to: number }[] = [];
  tr.doc.forEach((node, offset) => {
    if (tr.doc.childCount > 1 && node.isTextblock && node.content.size === 0) {
      empty.push({ from: offset, to: offset + node.nodeSize });
    }
  });
  for (const range of empty.reverse()) tr.delete(range.from, range.to);
  return { doc: tr.doc, text, ids, map: (pos) => tr.mapping.map(pos, -1) };
}

export function wordAt(doc: ProseNode, pos: number): { from: number; to: number } | null {
  const safe = Math.max(0, Math.min(pos, doc.content.size));
  const resolved = doc.resolve(safe);
  const parent = resolved.parent;
  if (!parent.isTextblock) return null;
  const text = parent.textBetween(0, parent.content.size, undefined, "\ufffc");
  let start = resolved.parentOffset;
  let end = resolved.parentOffset;
  while (start > 0 && WORD_CHAR.test(text[start - 1] ?? "")) start -= 1;
  while (end < text.length && WORD_CHAR.test(text[end] ?? "")) end += 1;
  if (start === end) return null;
  const base = resolved.start();
  return { from: base + start, to: base + end };
}

/** Encaja en el borde de una palabra; la puntuación y los espacios no entran en la referencia. */
export function snapToWord(doc: ProseNode, pos: number, side: "start" | "end"): number {
  const word = wordAt(doc, pos);
  if (word) return side === "start" ? word.from : word.to;
  const safe = Math.max(0, Math.min(pos, doc.content.size));
  const resolved = doc.resolve(safe);
  if (!resolved.parent.isTextblock) return pos;
  const text = resolved.parent.textBetween(0, resolved.parent.content.size, undefined, "\ufffc");
  let offset = resolved.parentOffset;
  if (side === "end") {
    while (offset > 0 && !WORD_CHAR.test(text[offset - 1] ?? "")) offset -= 1;
  } else {
    while (offset < text.length && !WORD_CHAR.test(text[offset] ?? "")) offset += 1;
  }
  return resolved.start() + offset;
}

/** Verdadero si el rango tiene texto y todo ese texto es generado. */
export function isFullyGenerated(doc: ProseNode, from: number, to: number): boolean {
  if (to <= from) return false;
  let sawText = false;
  let manual = false;
  doc.nodesBetween(from, to, (node) => {
    if (manual || !node.isText) return;
    sawText = true;
    if (!node.marks.some((mark) => mark.type.name === "generated")) manual = true;
  });
  return sawText && !manual;
}

export function generatedIdsBetween(doc: ProseNode, from: number, to: number): { blockId: string; generationId: string }[] {
  const seen = new Map<string, string>();
  doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type.name !== "generated") continue;
      const id = String(mark.attrs.id ?? "");
      if (id && !seen.has(id)) seen.set(id, String(mark.attrs.generationId ?? ""));
    }
  });
  return [...seen].map(([blockId, generationId]) => ({ blockId, generationId }));
}

export type GeneratedSpan = {
  id: string;
  generationId: string;
  text: string;
  from: number;
  to: number;
};

export function readGenerated(doc: ProseNode, id: string): GeneratedSpan | null {
  let found: GeneratedSpan | null = null;
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find((item) => item.type.name === "generated" && item.attrs.id === id);
    if (!mark) return;
    const text = node.text ?? "";
    if (!found) {
      found = {
        id,
        generationId: String(mark.attrs.generationId ?? ""),
        text,
        from: pos,
        to: pos + node.nodeSize,
      };
      return;
    }
    found = { ...found, text: found.text + text, to: pos + node.nodeSize };
  });
  return found;
}

export type LiveReference = {
  id: string;
  intent: ReferenceIntent;
  text: string;
  from: number;
  to: number;
  anchorPos: number | null;
};

export function readReferences(doc: ProseNode): LiveReference[] {
  const byId = new Map<string, LiveReference>();
  doc.descendants((node, pos) => {
    if (node.type.name === "referenceAnchor") {
      const referenceId = String(node.attrs.referenceId ?? "");
      if (!referenceId) return;
      const current = byId.get(referenceId);
      if (!current) {
        byId.set(referenceId, {
          id: referenceId,
          intent: "textual",
          text: "",
          from: pos,
          to: pos,
          anchorPos: pos,
        });
        return;
      }
      byId.set(referenceId, { ...current, anchorPos: pos });
      return;
    }
    if (!node.isText) return;
    const mark = node.marks.find((item) => item.type.name === "reference");
    if (!mark) return;
    const id = String(mark.attrs.id ?? "");
    if (!id) return;
    const intent = isReferenceIntent(mark.attrs.intent) ? mark.attrs.intent : "textual";
    const text = node.text ?? "";
    const current = byId.get(id);
    if (!current) {
      byId.set(id, { id, intent, text, from: pos, to: pos + node.nodeSize, anchorPos: null });
      return;
    }
    byId.set(id, {
      ...current,
      intent,
      text: current.text + text,
      from: Math.min(current.from, pos),
      to: Math.max(current.to, pos + node.nodeSize),
    });
  });
  return [...byId.values()];
}

export function sameBlock(doc: ProseNode, a: number, b: number): boolean {
  const left = blockStart(doc, a);
  const right = blockStart(doc, b);
  return left !== null && left === right;
}

export function localPassage(doc: ProseNode, cursor: number, budget = 2400): { text: string; trimmed: boolean } {
  const end = Math.max(0, Math.min(cursor, doc.content.size));
  const raw = doc.textBetween(0, end, "\n\n").trim();
  if (raw.length <= budget) return { text: raw, trimmed: false };
  const tail = raw.slice(raw.length - budget);
  const breakAt = tail.indexOf("\n\n");
  const text = (breakAt >= 0 ? tail.slice(breakAt + 2) : tail).trim();
  return { text, trimmed: true };
}

function blockStart(doc: ProseNode, pos: number): number | null {
  const safe = Math.max(0, Math.min(pos, doc.content.size));
  const resolved = doc.resolve(safe);
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth).isBlock) return resolved.before(depth);
  }
  return null;
}
