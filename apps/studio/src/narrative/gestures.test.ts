import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@tiptap/pm/state";
import {
  connectReference,
  docWithParagraph,
  endOfBlock,
  eraseGenerated,
  generatedIdsBetween,
  isFullyGenerated,
  markGenerated,
  placeGenerated,
  snapToWord,
  tokenAt,
  wordAt,
} from "./document";
import { emotionOf } from "./emotion";
import { contextWeights } from "./weights";

test("doble clic toma la palabra entera y las manijas encajan en palabras", () => {
  const doc = docWithParagraph("El reflector cruzó una azotea vacía.");
  const inside = 1 + "El reflector cruzó una azo".length;
  const word = wordAt(doc, inside);
  assert.equal(doc.textBetween(word!.from, word!.to), "azotea");
  assert.equal(doc.textBetween(snapToWord(doc, 1 + "El ref".length, "start"), word!.to), "reflector cruzó una azotea");
  assert.equal(wordAt(doc, 1 + "El reflector".length + 1)?.from, 1 + "El reflector ".length);
  const afterPeriod = doc.content.size - 1;
  assert.equal(doc.textBetween(word!.from, snapToWord(doc, afterPeriod, "end")), "azotea vacía");
});

test("generar en medio de una palabra no la parte: entra un párrafo nuevo", () => {
  const doc = docWithParagraph("La lluvia golpeaba los ventanales de Gotham.");
  const mid = 1 + "La lluvia gol".length;
  const placed = placeGenerated(doc, mid, "Un ruido metálico interrumpió la azotea.", "blk", "gen");
  const paragraphs: string[] = [];
  placed.doc.forEach((node) => paragraphs.push(node.textContent));
  assert.deepEqual(paragraphs, [
    "La lluvia golpeaba los ventanales de Gotham.",
    "Un ruido metálico interrumpió la azotea.",
  ]);
  assert.equal(placed.cursor > endOfBlock(doc, mid), true);
});

test("borrar un arrastre saca solo lo generado", () => {
  let doc = docWithParagraph("Escrito a mano. Generado por el modelo.");
  const from = 1 + "Escrito a mano. ".length;
  doc = markGenerated(doc, from, doc.content.size - 1, "blk", "gen");
  const erased = eraseGenerated(doc, 1, doc.content.size);
  assert.ok(erased);
  assert.match(erased.doc.textContent, /Escrito a mano/);
  assert.equal(erased.doc.textContent.includes("Generado"), false);
  assert.equal(erased.ids[0]?.blockId, "blk");
});

test("el segundo clic distingue palabra, espacio y letra", () => {
  const doc = docWithParagraph("La lluvia golpeaba.");
  assert.equal(tokenAt(doc, 1 + "La llu".length)?.kind, "palabra");
  assert.equal(tokenAt(doc, 1 + "La".length)?.kind, "espacio");
  assert.equal(tokenAt(doc, doc.content.size - 1)?.kind, "letra");
});

test("el color de la columna sale de la emoción del párrafo", () => {
  assert.equal(emotionOf("La lluvia golpeaba los ventanales.").id, "atmosfera");
  assert.equal(emotionOf("Un golpe seco sonó contra la baranda.").id, "accion");
  assert.equal(emotionOf("Batman guardó lo que sabía.").id, "introspeccion");
});

test("seleccionar solo texto generado lo borra; si hay texto propio, no", () => {
  let doc = docWithParagraph("Escrito a mano. Generado por el modelo.");
  const from = 1 + "Escrito a mano. ".length;
  const to = doc.content.size - 1;
  doc = markGenerated(doc, from, to, "blk-1", "gen-1");
  assert.equal(isFullyGenerated(doc, from + 2, to), true);
  assert.equal(isFullyGenerated(doc, 1, to), false);
  assert.equal(isFullyGenerated(doc, from, from), false);
  assert.deepEqual(generatedIdsBetween(doc, from, to), [{ blockId: "blk-1", generationId: "gen-1" }]);
});

test("lo más reciente antes del cursor pesa más, lo de después no pesa", () => {
  const schema = docWithParagraph("").type.schema;
  const paragraphs = ["Uno.", "Dos.", "Tres.", "Cuatro.", "Cinco."].map((text) =>
    schema.node("paragraph", null, [schema.text(text)]),
  );
  const doc = schema.node("doc", null, paragraphs);
  let cursor = 0;
  doc.forEach((node, offset, index) => {
    if (index === 3) cursor = offset + node.nodeSize - 1;
  });
  const weights = contextWeights(doc, cursor);
  assert.deepEqual(
    weights.map((item) => item.weight),
    [2, 4, 6, 10, 0],
  );
  assert.equal(weights[4]?.after, true);
});

test("una referencia conectada trae un párrafo lejano aunque esté fuera de la ventana", () => {
  const schema = docWithParagraph("").type.schema;
  const far = schema.node("paragraph", null, [schema.text("La llave quedó en el muelle.")]);
  const filler = schema.node("paragraph", null, [schema.text("x".repeat(3000))]);
  const last = schema.node("paragraph", null, [schema.text("Final.")]);
  let doc = schema.node("doc", null, [far, filler, last]);
  const cursor = doc.content.size - 1;
  assert.equal(contextWeights(doc, cursor)[0]?.weight, 0);
  doc = connectReference(doc, 1 + "La ".length, 1 + "La llave".length, "objeto", "ref-llave");
  const weights = contextWeights(doc, cursor);
  assert.equal(weights[0]?.referenced, true);
  assert.equal(weights[0]?.weight, 9);
  const tr = EditorState.create({ doc }).tr.insertText("Antes. ", 1);
  assert.equal(contextWeights(tr.doc, tr.mapping.map(cursor))[0]?.referenced, true);
});
