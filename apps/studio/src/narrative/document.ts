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
