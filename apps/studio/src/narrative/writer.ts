import { weightOf, type StyleId } from "./style";
import type { ReferenceIntent, StyleWeight } from "./types";

/**
 * Escritor mock: no llama a un modelo.
 * La escena es una secuencia de pasos; cada paso tiene varias redacciones.
 * Un paso ya está escrito si alguna de sus redacciones aparece antes del cursor.
 */

export const WORDS_PER_LINE = 12;
export const MAX_LINES = 10;
export const PREVIEW_LINES = 2;

type Variant = { text: string; trait: StyleId };
type Beat = { id: string; variants: (names: string[]) => Variant[] };

const fixed = (variants: Variant[]) => () => variants;

const OPENING: Beat[] = [
  {
    id: "lluvia",
    variants: fixed([
      { text: "La lluvia golpeaba los ventanales de Gotham.", trait: "cinematografico" },
      { text: "Llovía sobre Gotham desde antes de que cayera la noche.", trait: "noir" },
      { text: "La lluvia todavía no caía sobre nadie.", trait: "atmosferico" },
      { text: "Nadie en Gotham se acordaba de la última noche seca.", trait: "humor" },
    ]),
  },
  {
    id: "vigia",
    variants: fixed([
      { text: "Batman observaba la ciudad desde lo alto del edificio.", trait: "cinematografico" },
      { text: "Desde la cornisa, Batman miraba la ciudad sin moverse.", trait: "noir" },
      { text: "Batman llevaba una hora en la azotea, pensando en lo que no había dicho.", trait: "introspectivo" },
      { text: "Batman esperaba en la cornisa, listo para saltar.", trait: "accion" },
    ]),
  },
  {
    id: "reflector",
    variants: fixed([
      { text: "El reflector del diario cruzó una azotea vacía y se apagó.", trait: "cinematografico" },
      { text: "Un cartel de neón parpadeó dos pisos más abajo.", trait: "noir" },
      { text: "El agua corría por el borde de la cornisa.", trait: "atmosferico" },
    ]),
  },
];

const CONTINUATION: Beat[] = [
  {
    id: "ruido",
    variants: fixed([
      { text: "Un ruido metálico interrumpió la azotea.", trait: "cinematografico" },
      { text: "Algo de metal cedió detrás del tanque de agua.", trait: "noir" },
      { text: "Un golpe seco sonó contra la baranda.", trait: "accion" },
      { text: "Un ruido, apenas, le recordó que no estaba solo.", trait: "introspectivo" },
    ]),
  },
  {
    id: "espera",
    variants: (names) =>
      names.includes("batman")
        ? [
            { text: "Batman no se dio vuelta enseguida.", trait: "cinematografico" },
            { text: "Batman esperó a que el ruido se repitiera.", trait: "thriller" },
            { text: "Batman ya estaba de pie antes de que el eco terminara.", trait: "accion" },
            { text: "Batman guardó lo que sabía y no se movió.", trait: "introspectivo" },
          ]
        : [
            { text: "Nadie con nombre lo reclamó.", trait: "noir" },
            { text: "El eco tardó en irse.", trait: "atmosferico" },
          ],
  },
  {
    id: "presencia",
    variants: (names) =>
      names.includes("joker")
        ? [
            { text: "Una risa llegó antes que la figura.", trait: "cinematografico" },
            { text: "Alguien se rió en la oscuridad, bajo, como si le hubieran contado un chiste.", trait: "humor" },
            { text: "La risa sonó una sola vez, demasiado cerca del tanque.", trait: "thriller" },
          ]
        : [
            { text: "Nadie se mostró.", trait: "noir" },
            { text: "La sombra no tenía dueño todavía.", trait: "atmosferico" },
            { text: "Lo que fuera, se quedó quieto detrás del tanque.", trait: "thriller" },
          ],
  },
  {
    id: "clima",
    variants: fixed([
      { text: "El agua corre por el borde de la cornisa.", trait: "atmosferico" },
      { text: "La lluvia borró las huellas antes de que pudiera leerlas.", trait: "noir" },
      { text: "Abajo, una sirena se alejó sin apuro.", trait: "cinematografico" },
      { text: "El siguiente movimiento ya es físico.", trait: "accion" },
    ]),
  },
  {
    id: "puerta",
    variants: fixed([
      { text: "La puerta de servicio estaba abierta desde adentro.", trait: "thriller" },
      { text: "La cerradura de la puerta de servicio colgaba suelta.", trait: "noir" },
      { text: "Alguien había pateado la puerta de servicio.", trait: "accion" },
    ]),
  },
  {
    id: "intruso",
    variants: fixed([
      { text: "Alguien había conseguido entrar.", trait: "cinematografico" },
      { text: "No era el primero en llegar esa noche.", trait: "noir" },
      { text: "Quien fuera, conocía el edificio mejor que él.", trait: "introspectivo" },
    ]),
  },
  {
    id: "decision",
    variants: fixed([
      { text: "Bajó un escalón, sin apurarse.", trait: "cinematografico" },
      { text: "Se acercó a la puerta por el lado de la sombra.", trait: "noir" },
      { text: "Cruzó la azotea en tres pasos.", trait: "accion" },
      { text: "Decidió no encender nada todavía.", trait: "introspectivo" },
    ]),
  },
  {
    id: "ciudad",
    variants: fixed([
      { text: "La ciudad siguió respirando bajo la lluvia.", trait: "atmosferico" },
      { text: "Gotham no se dio por enterada.", trait: "noir" },
      { text: "Ninguna ventana se encendió del otro lado.", trait: "cinematografico" },
    ]),
  },
];

const SCENE = [...OPENING, ...CONTINUATION];

const ECHO: Record<ReferenceIntent, (text: string) => string> = {
  textual: (text) => `«${text}».`,
  objeto: (text) => `Volvió a pensar en «${text}».`,
  promesa: (text) => `Recordó lo que había prometido sobre «${text}».`,
  conflicto: (text) => `Lo de «${text}» seguía sin resolverse.`,
  relacion: (text) => `Entre ellos seguía pesando «${text}».`,
  hecho: (text) => `Nadie más sabía lo de «${text}».`,
};

export type WriterInput = {
  /** Texto del documento antes del cursor. */
  before: string;
  /** Texto completo, para no repetir una redacción que ya está. */
  whole: string;
  lines: number;
  names: string[];
  weights: StyleWeight[];
  references: { text: string; intent: ReferenceIntent }[];
  discarded: string[];
};

export type WrittenSentence = {
  text: string;
  beat: string;
  /** El paso ya tuvo una redacción descartada: es la misma idea con otras palabras. */
  recycled: boolean;
  reference: boolean;
};

export function writeSentences(input: WriterInput): WrittenSentence[] {
  const lines = Math.max(0, Math.min(MAX_LINES, Math.round(input.lines)));
  if (lines === 0) return [];
  const names = input.names.map((name) => name.trim().toLowerCase());
  const discarded = new Set(input.discarded.map(clean));
  const out: WrittenSentence[] = [];

  for (const reference of input.references) {
    if (out.length >= lines) break;
    const text = ECHO[reference.intent](reference.text.trim());
    if (!reference.text.trim() || input.whole.includes(text) || discarded.has(clean(text))) continue;
    out.push({ text, beat: "referencia", recycled: false, reference: true });
  }

  const taken = new Set(splitSentences(input.whole).map(clean));
  for (const beat of SCENE.slice(nextBeat(input.before, names))) {
    if (out.length >= lines) break;
    const variants = beat.variants(names);
    const fresh = variants.filter((variant) => !taken.has(clean(variant.text)) && !discarded.has(clean(variant.text)));
    if (fresh.length === 0) continue;
    const pick = strongest(fresh, input.weights);
    const recycled = variants.some((variant) => discarded.has(clean(variant.text)));
    taken.add(clean(pick.text));
    out.push({ text: pick.text, beat: beat.id, recycled, reference: false });
  }
  return out;
}

export function joinSentences(sentences: WrittenSentence[]): string {
  return sentences.map((sentence) => sentence.text).join(" ");
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…»])\s+/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function nextBeat(before: string, names: string[]): number {
  const written = new Set(splitSentences(before).map(clean));
  let last = -1;
  SCENE.forEach((beat, index) => {
    if (beat.variants(names).some((variant) => written.has(clean(variant.text)))) last = index;
  });
  if (last >= 0) return last + 1;
  return before.trim().length > 0 ? OPENING.length : 0;
}

function strongest(variants: Variant[], weights: StyleWeight[]): Variant {
  let best = variants[0]!;
  for (const variant of variants) {
    if (weightOf(weights, variant.trait) > weightOf(weights, best.trait)) best = variant;
  }
  return best;
}

function clean(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}
