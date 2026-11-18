import assert from "node:assert/strict";
import test from "node:test";
import { documentFromJSON, readReferences } from "./document";
import { assemblePrompt } from "./prompt";
import { blankDemo, continuedDemo, mockContinuation } from "./demo";
import { mixFromWeights } from "./style";

test("los dos ejemplos se distinguen: uno vacío y otro ya empezado", () => {
  const blank = blankDemo();
  const continued = continuedDemo();
  assert.equal((documentFromJSON(blank.document).textContent ?? "").trim(), "");
  const story = documentFromJSON(continued.document).textContent ?? "";
  assert.match(story, /ventanales de Gotham/);
  assert.match(story, /se apagó/);
  const reference = readReferences(documentFromJSON(continued.document))[0];
  assert.equal(reference?.text, "azotea vacía");
  assert.equal(reference?.intent, "hecho");
  assert.equal(continued.contextDocs.find((doc) => doc.name === "Joker")?.included, false);
  assert.equal(continued.contextDocs.find((doc) => doc.name === "Batman")?.protected, true);
});

test("la propuesta mock cambia si el texto ya empezó, si entra Joker o si cambia la inspiración", () => {
  const night = mixFromWeights({
    cinematografico: 80,
    noir: 65,
    introspectivo: 40,
    humor: 20,
    atmosferico: 70,
    thriller: 45,
    accion: 30,
  });
  const action = mixFromWeights({ accion: 80, noir: 10, atmosferico: 10 });
  const opening = mockContinuation({ started: false, atSceneEnd: false, names: ["Batman"], weights: night });
  const withJoker = mockContinuation({
    started: false,
    atSceneEnd: false,
    names: ["Batman", "Joker"],
    weights: night,
  });
  const follow = mockContinuation({ started: true, atSceneEnd: true, names: ["Batman", "La azotea"], weights: night });
  const followJoker = mockContinuation({
    started: true,
    atSceneEnd: true,
    names: ["Batman", "Joker"],
    weights: night,
  });
  const physical = mockContinuation({ started: true, atSceneEnd: true, names: ["Batman"], weights: action });
  assert.match(opening, /primera frase/);
  assert.match(withJoker, /risa/);
  assert.notEqual(opening, withJoker);
  assert.match(follow, /ruido metálico/);
  assert.match(followJoker, /risa/);
  assert.match(follow, /cornisa/);
  assert.match(physical, /físico/);
  assert.notEqual(follow, physical);

  const continued = continuedDemo();
  const doc = documentFromJSON(continued.document);
  const draft = assemblePrompt(doc, doc.content.size - 1, continued.format, continued.style, continued.contextDocs);
  assert.equal(draft.recent !== null, true);
  assert.equal(draft.contextDocs.some((item) => item.label === "Joker"), false);
  assert.equal(draft.references.length, 1);
});
