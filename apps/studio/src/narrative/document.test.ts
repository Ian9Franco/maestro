import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@tiptap/pm/state";
import {
  addReference,
  docWithParagraph,
  documentFromJSON,
  insertText,
  markGenerated,
  narrativeSchema,
  readGenerated,
  readReferences,
  sameBlock,
} from "./document";

test("el esquema no arrastra el editor anterior ni índices de línea", () => {
  const schema = narrativeSchema();
  for (const name of ["doc", "paragraph", "heading", "text", "hardBreak", "referenceAnchor"]) {
    assert.ok(schema.nodes[name], name);
  }
  for (const name of ["blockquote", "codeBlock", "bulletList", "orderedList", "horizontalRule"]) {
    assert.equal(schema.nodes[name], undefined, name);
  }
  for (const name of ["bold", "italic", "generated", "reference"]) {
    assert.ok(schema.marks[name], name);
  }
});

test("editar antes de un bloque generado mueve la posición y conserva el id", () => {
  let doc = docWithParagraph("uno dos");
  doc = markGenerated(doc, 5, 8, "block-1", "gen-1");
  doc = insertText(doc, 1, "cero ");
  const found = readGenerated(doc, "block-1");
  assert.equal(found?.text, "dos");
  assert.equal(found?.generationId, "gen-1");
  assert.notEqual(found?.from, 5);
  assert.notEqual(doc.textBetween(5, 8), "dos");
  const restored = documentFromJSON(doc.toJSON());
  assert.equal(readGenerated(restored, "block-1")?.text, "dos");
});

test("una referencia sigue unida a su ancla después de insertar un bloque delante", () => {
  let doc = docWithParagraph("Capítulo dos. El puente.");
  const sourceFrom = 1 + "Capítulo dos. ".length;
  const sourceTo = sourceFrom + "El puente.".length;
  doc = addReference(doc, sourceFrom, sourceTo, sourceTo, "conflicto", "ref-1", "anc-1");
  const schema = doc.type.schema;
  const tr = EditorState.create({ doc }).tr;
  tr.insert(0, schema.node("heading", { level: 1 }, [schema.text("Capítulo uno")]));
  doc = tr.doc;
  const reference = readReferences(doc).find((item) => item.id === "ref-1");
  assert.equal(reference?.text, "El puente.");
  assert.equal(reference?.intent, "conflicto");
  assert.equal(typeof reference?.anchorPos, "number");
  assert.ok((reference?.anchorPos ?? 0) > sourceTo);
  const anchor = findAnchor(doc, "ref-1");
  assert.equal(anchor?.attrs.referenceId, "ref-1");
  assert.equal(anchor?.attrs.id, "anc-1");
});

test("el ancla cuenta solo si comparte el bloque del cursor", () => {
  let doc = docWithParagraph("El puente queda atrás.");
  doc = addReference(doc, 1, 10, 10, "objeto", "ref-2", "anc-2");
  const schema = doc.type.schema;
  const tr = EditorState.create({ doc }).tr;
  tr.insert(doc.content.size, schema.node("paragraph", null, [schema.text("Acá sigue la escena.")]));
  doc = tr.doc;
  const reference = readReferences(doc)[0];
  assert.ok(reference);
  assert.equal(sameBlock(doc, reference.anchorPos ?? 0, 1), true);
  const cursor = doc.content.size - 1;
  assert.equal(sameBlock(doc, reference.anchorPos ?? 0, cursor), false);
});

function findAnchor(doc: ReturnType<typeof docWithParagraph>, referenceId: string) {
  let found: { attrs: { referenceId?: string; id?: string } } | null = null;
  doc.descendants((node) => {
    if (node.type.name === "referenceAnchor" && node.attrs.referenceId === referenceId) found = node;
  });
  return found;
}
