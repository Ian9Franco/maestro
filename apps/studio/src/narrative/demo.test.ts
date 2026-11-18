import assert from "node:assert/strict";
import test from "node:test";
import { documentFromJSON, readReferences } from "./document";
import { assemblePrompt } from "./prompt";
import { blankDemo, continuedDemo } from "./demo";
import { mixFromWeights } from "./style";
import { writeSentences, type WriterInput } from "./writer";

const night = mixFromWeights({
  cinematografico: 80,
  noir: 65,
  introspectivo: 40,
  humor: 20,
  atmosferico: 70,
  thriller: 45,
  accion: 30,
});
const action = mixFromWeights({ cinematografico: 50, noir: 20, introspectivo: 25, atmosferico: 30, thriller: 40, accion: 80 });

function storyOf(record: ReturnType<typeof continuedDemo>) {
  const doc = documentFromJSON(record.document);
  return doc.textBetween(0, doc.content.size, " ");
}

function input(partial: Partial<WriterInput>): WriterInput {
  return { before: "", whole: "", lines: 2, names: ["Batman"], weights: night, references: [], discarded: [], ...partial };
}

test("los dos ejemplos se distinguen: uno vacío y otro ya empezado", () => {
  const blank = blankDemo();
  const continued = continuedDemo();
  assert.equal((documentFromJSON(blank.document).textContent ?? "").trim(), "");
  const story = storyOf(continued);
  assert.match(story, /ventanales de Gotham/);
  assert.match(story, /se apagó/);
  const reference = readReferences(documentFromJSON(continued.document))[0];
  assert.equal(reference?.text, "azotea vacía");
  assert.equal(reference?.anchorPos, null);
  assert.equal(continued.contextDocs.find((doc) => doc.name === "Joker")?.included, false);
});

test("desde cero empieza la escena; ya empezado sigue después de lo escrito", () => {
  const opening = writeSentences(input({ lines: 1 }));
  assert.equal(opening[0]?.text, "La lluvia golpeaba los ventanales de Gotham.");

  const story = storyOf(continuedDemo());
  const next = writeSentences(input({ before: story, whole: story }));
  assert.deepEqual(
    next.map((item) => item.text),
    ["Un ruido metálico interrumpió la azotea.", "Batman no se dio vuelta enseguida."],
  );
});

test("cada renglón arrastrado es una oración, y el estilo y las fichas cambian la redacción", () => {
  const story = storyOf(continuedDemo());
  assert.equal(writeSentences(input({ before: story, whole: story, lines: 5 })).length, 5);
  const withJoker = writeSentences(input({ before: story, whole: story, lines: 3, names: ["Batman", "Joker"] }));
  assert.match(withJoker[2]?.text ?? "", /risa/i);
  const physical = writeSentences(input({ before: story, whole: story, weights: action }));
  assert.equal(physical[0]?.text, "Un golpe seco sonó contra la baranda.");
});

test("después de borrar, la misma idea vuelve con otras palabras", () => {
  const story = storyOf(continuedDemo());
  const first = writeSentences(input({ before: story, whole: story, lines: 1 }));
  const again = writeSentences(input({ before: story, whole: story, lines: 1, discarded: [first[0]!.text] }));
  assert.notEqual(again[0]?.text, first[0]?.text);
  assert.equal(again[0]?.beat, first[0]?.beat);
  assert.equal(again[0]?.recycled, true);
});

test("una referencia conectada entra primero, según su intención", () => {
  const story = storyOf(continuedDemo());
  const out = writeSentences(
    input({ before: story, whole: story, references: [{ text: "azotea vacía", intent: "hecho" }] }),
  );
  assert.equal(out[0]?.reference, true);
  assert.match(out[0]?.text ?? "", /azotea vacía/);
});

test("la referencia del ejemplo sigue al cursor a cualquier párrafo", () => {
  const continued = continuedDemo();
  const doc = documentFromJSON(continued.document);
  const draft = assemblePrompt(doc, 2, continued.format, continued.style, continued.contextDocs);
  assert.equal(draft.references.length, 1);
  assert.match(draft.references[0]?.reason ?? "", /punto de inserción/);
  assert.equal(draft.contextDocs.some((item) => item.label === "Joker"), false);
});
