import assert from "node:assert/strict";
import test from "node:test";
import { defaultDials, dialCaption, readDial, withDial } from "./dials";
import { emptyStyleMix } from "./style";
import { writeSentences } from "./writer";

test("arrastrar hacia una característica sube ese eje y no los otros", () => {
  const hub = { x: 200, y: 200 };
  const tension = readDial(hub, { x: hub.x - 120, y: hub.y + 60 });
  assert.equal(tension.id, "tension");
  assert.equal(tension.value > 40, true);
  const next = withDial(defaultDials(), tension.id, tension.value);
  assert.equal(next.tension, tension.value);
  assert.equal(next.surprise, defaultDials().surprise);
});

test("el modo alto cambia la redacción; la sorpresa alta elige la que no era obvia", () => {
  const variants = [
    { text: "La lluvia golpeaba los ventanales de Gotham.", trait: "cinematografico" as const },
    { text: "Nadie en Gotham se acordaba de la última noche seca.", trait: "humor" as const },
  ];
  const input = {
    before: "",
    whole: "",
    lines: 1,
    names: [],
    weights: emptyStyleMix(),
    references: [],
    discarded: [],
  };
  const calm = writeSentences(input);
  const joking = writeSentences({ ...input, dials: { ...defaultDials(), mode: "humor", amount: 90, surprise: 0 } });
  assert.equal(calm[0]?.text, variants[0].text);
  assert.equal(joking[0]?.text, variants[1].text);
  const startled = writeSentences({
    ...input,
    weights: emptyStyleMix().map((trait) => ({ ...trait, weight: trait.id === "cinematografico" ? 80 : 0 })),
    dials: { ...defaultDials(), surprise: 80, amount: 0 },
  });
  assert.equal(startled[0]?.text, "Llovía sobre Gotham desde antes de que cayera la noche.");
  assert.match(dialCaption({ ...defaultDials(), tension: 90 }, "tension"), /muy tensa/);
});
