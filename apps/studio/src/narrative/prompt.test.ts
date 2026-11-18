import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@tiptap/pm/state";
import { addReference, docWithParagraph, readReferences } from "./document";
import { assemblePrompt, renderPrompt } from "./prompt";
import type { ContextDocument } from "./types";

test("el prompt incluye fichas y la referencia del cursor, y deja afuera el resto", () => {
  let doc = docWithParagraph("El puente queda atrás.");
  doc = addReference(doc, 1, 10, 10, "conflicto", "ref-1", "anc-1");
  const schema = doc.type.schema;
  const tr = EditorState.create({ doc }).tr;
  tr.insert(doc.content.size, schema.node("paragraph", null, [schema.text("Mara no abre la puerta.")]));
  doc = tr.doc;
  const far = doc.content.size - 1;
  const docs: ContextDocument[] = [
    { id: "a", name: "Mara", kind: "personaje", body: "No dice el nombre de su hermano.", included: true, protected: true },
    { id: "b", name: "Notas sueltas", kind: "notas", body: "Idea que no entra.", included: false, protected: false },
  ];
  const here = readReferences(doc)[0]?.anchorPos ?? 1;
  const draft = assemblePrompt(doc, here, "Prosa corrida.", "Sobrio.", docs);
  assert.equal(draft.contextDocs.length, 1);
  assert.equal(draft.contextDocs[0]?.label, "Mara");
  assert.match(draft.contextDocs[0]?.reason ?? "", /protegida/);
  assert.equal(draft.references.length, 1);
  assert.equal(draft.references[0]?.text, "El puente");
  assert.equal(draft.recent?.text.includes("El puente"), true);
  const away = assemblePrompt(doc, far, "Prosa corrida.", "Sobrio.", docs);
  assert.equal(away.references.length, 0);
  assert.equal(away.excluded.some((item) => item.reason.includes("punto de inserción")), true);
  assert.equal(away.excluded.some((item) => item.label === "Notas sueltas"), true);
  const rendered = renderPrompt(draft);
  assert.match(rendered, /SISTEMA[\s\S]+FORMATO[\s\S]+ESTILO[\s\S]+DOCUMENTACIÓN[\s\S]+FRAGMENTO RECIENTE[\s\S]+REFERENCIAS[\s\S]+INSTRUCCIÓN/);
  assert.equal(rendered.includes("Idea que no entra."), false);
});

test("un texto largo se recorta por recencia y el recorte queda explicado", () => {
  const doc = docWithParagraph(`${"palabra ".repeat(800)}final`);
  const cursor = doc.content.size - 1;
  const draft = assemblePrompt(doc, cursor, "", "", []);
  assert.ok((draft.recent?.text.length ?? 0) < 2600);
  assert.match(draft.recent?.text ?? "", /final/);
  assert.equal(draft.excluded.some((item) => item.reason.includes("presupuesto")), true);
  assert.equal(renderPrompt(draft).includes("FORMATO"), false);
});
