import type { JSONContent } from "@tiptap/core";
import { addReference, documentFromJSON, narrativeSchema } from "./document";
import { createProjectRecord } from "./repository";
import { describeStyle, mixFromWeights, weightOf, type StyleId } from "./style";
import type { ContextDocument, ContextKind, ProjectRecord, StyleWeight } from "./types";

export const DEMO_CONTINUED_ID = "demo-azotea";
export const DEMO_BLANK_ID = "demo-desde-cero";

const FORMAT = "Prosa corrida. Un bloque por escena, no un capítulo entero.";

export function continuedDemo(now = "2026-11-18T12:00:00.000Z"): ProjectRecord {
  const mix = mixFromWeights({
    cinematografico: 80,
    noir: 65,
    introspectivo: 40,
    humor: 20,
    atmosferico: 70,
    thriller: 45,
    accion: 30,
  });
  return {
    ...createProjectRecord("Azotea, a medias", now, DEMO_CONTINUED_ID),
    format: FORMAT,
    style: describeStyle(mix),
    styleMix: mix,
    influence: ["La lluvia y la azotea siguen.", "Batman todavía no bajó.", "No revelar lo que él ya sabe."],
    document: continuedDocument(),
    contextDocs: demoDocs(false),
    updatedAt: now,
  };
}

export function blankDemo(now = "2026-11-18T11:00:00.000Z"): ProjectRecord {
  const mix = mixFromWeights({
    cinematografico: 80,
    noir: 65,
    introspectivo: 40,
    humor: 20,
    atmosferico: 70,
    thriller: 45,
    accion: 30,
  });
  return {
    ...createProjectRecord("Desde cero", now, DEMO_BLANK_ID),
    format: FORMAT,
    style: describeStyle(mix),
    styleMix: mix,
    influence: ["Todavía no hay una primera línea.", "Las fichas esperan. No escriben solas."],
    contextDocs: demoDocs(false),
    updatedAt: now,
  };
}

export function mockContinuation(input: {
  started: boolean;
  atSceneEnd: boolean;
  names: string[];
  weights: StyleWeight[];
}): string {
  const included = (name: string) => input.names.some((item) => item.toLowerCase() === name.toLowerCase());
  const weight = (id: StyleId) => weightOf(input.weights, id);
  const tone = accent(weight);
  if (!input.started) {
    const opening = included("Joker")
      ? "La lluvia todavía no cae sobre nadie. Una risa cruza la azotea antes de que la ciudad elija un testigo."
      : "La lluvia todavía no cae sobre nadie. La azotea está vacía y la ciudad espera la primera frase.";
    return tone ? `${opening} ${tone}` : opening;
  }
  if (!input.atSceneEnd) {
    return "Desde esta frase seguiría un bloque nuevo, sin reescribir lo que ya está escrito.";
  }
  let line = included("Batman")
    ? "Un ruido metálico interrumpió la azotea. Batman no se dio vuelta enseguida."
    : "Un ruido metálico interrumpió la azotea. Nadie con nombre lo reclamó.";
  if (included("Joker")) line += " La risa llegó antes que la figura.";
  if (weight("introspectivo") >= 50 && included("Batman")) line += " Guarda lo que sabe.";
  return tone ? `${line} ${tone}` : line;
}

export function continuedDocument(): JSONContent {
  const schema = narrativeSchema();
  let doc = schema.node("doc", null, [
    paragraph("La lluvia golpeaba los ventanales de Gotham."),
    paragraph("Batman observaba la ciudad desde lo alto del edificio. No había bajado. Todavía no."),
    paragraph("El reflector del diario cruzó una azotea vacía y se apagó."),
  ]);
  const phrase = locate(doc, "azotea vacía");
  if (!phrase) return doc.toJSON();
  doc = addReference(doc, phrase.from, phrase.to, phrase.to, "hecho", "ref-azotea", "anc-azotea");
  return doc.toJSON();
}

function demoDocs(jokerIncluded: boolean): ContextDocument[] {
  return [
    ficha(
      "doc-batman",
      "Batman",
      "personaje",
      "Observa y no explica. Si sabe un secreto, no lo dice en voz alta. Baja solo cuando la escena ya no puede seguir sin él.",
      true,
      true,
    ),
    ficha(
      "doc-joker",
      "Joker",
      "personaje",
      "Entra por el sonido antes que por la figura. No ocupa la escena salvo que alguien lo deje entrar.",
      jokerIncluded,
      false,
    ),
    ficha(
      "doc-azotea",
      "La azotea",
      "saga",
      "El reflector del diario barre la cornisa y se apaga. La lluvia espesa el borde del edificio.",
      true,
      true,
    ),
    ficha(
      "doc-regla",
      "Quién sabe qué",
      "lore",
      "Lo que un personaje sabe no lo saben los demás. El lector solo ve lo que la escena muestra.",
      true,
      true,
    ),
  ];
}

function ficha(
  id: string,
  name: string,
  kind: ContextKind,
  body: string,
  included: boolean,
  protectedDoc: boolean,
): ContextDocument {
  return { id, name, kind, body, included, protected: protectedDoc };
}

function paragraph(text: string) {
  const schema = narrativeSchema();
  return schema.node("paragraph", null, [schema.text(text)]);
}

function locate(doc: ReturnType<typeof documentFromJSON>, phrase: string): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text || found) return;
    const at = node.text.indexOf(phrase);
    if (at < 0) return;
    found = { from: pos + at, to: pos + at + phrase.length };
  });
  return found;
}

export function isEmptyStory(document: JSONContent): boolean {
  try {
    return (documentFromJSON(document).textContent ?? "").trim().length === 0;
  } catch {
    return false;
  }
}

function accent(weight: (id: StyleId) => number): string | null {
  const options: Array<[number, string]> = [
    [weight("noir"), "La ciudad se cierra sobre el edificio."],
    [weight("thriller"), "El tiempo, de golpe, se acorta."],
    [weight("accion"), "El siguiente movimiento ya es físico."],
    [weight("atmosferico"), "El agua corre por el borde de la cornisa."],
    [weight("humor"), "Nadie abajo habría pagado entrada."],
  ];
  options.sort((a, b) => b[0] - a[0]);
  const top = options[0];
  if (!top || top[0] < 55) return null;
  return top[1];
}
