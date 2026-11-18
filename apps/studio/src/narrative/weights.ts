import type { Node as ProseNode } from "@tiptap/pm/model";
import { readReferences, referenceConnected } from "./document";
import { LOCAL_PASSAGE_BUDGET } from "./prompt";

export type BlockWeight = {
  /** Posición del párrafo en el documento actual. Se recalcula, no se guarda. */
  pos: number;
  /** 0 a 10. */
  weight: number;
  referenced: boolean;
  after: boolean;
};

const DECAY = 0.62;

/**
 * Cuánto pesa cada párrafo en lo que sigue.
 * Lo más cercano antes del cursor pesa más. Lo que queda fuera de la ventana de recencia
 * no pesa, salvo que tenga una referencia conectada al punto de inserción.
 */
export function contextWeights(doc: ProseNode, cursor: number, budget = LOCAL_PASSAGE_BUDGET): BlockWeight[] {
  const blocks: { pos: number; end: number; chars: number }[] = [];
  doc.forEach((node, offset) => {
    blocks.push({ pos: offset, end: offset + node.nodeSize, chars: node.textContent.length });
  });
  const connected = readReferences(doc).filter((reference) => referenceConnected(doc, cursor, reference));
  const cursorIndex = blocks.findIndex((block) => cursor >= block.pos && cursor <= block.end);
  const here = cursorIndex < 0 ? blocks.length - 1 : cursorIndex;

  let used = 0;
  const weights = new Map<number, number>();
  for (let index = here; index >= 0; index -= 1) {
    const block = blocks[index]!;
    if (used >= budget) {
      weights.set(index, 0);
      continue;
    }
    used += block.chars;
    const recency = Math.round(10 * DECAY ** (here - index));
    weights.set(index, block.chars === 0 ? 0 : Math.max(1, recency));
  }

  return blocks.map((block, index) => {
    const referenced = connected.some((reference) => reference.from < block.end && reference.to > block.pos);
    const after = index > here;
    const base = after ? 0 : (weights.get(index) ?? 0);
    return { pos: block.pos, weight: referenced ? Math.max(base, 9) : base, referenced, after };
  });
}
