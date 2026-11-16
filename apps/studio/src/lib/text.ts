export type DocKind = "personaje" | "saga" | "lore" | "notas";

export type FactorId =
  | "tono"
  | "tension"
  | "ritmo"
  | "foco"
  | "modo"
  | "distancia"
  | "cierre"
  | "sorpresa";

export type FactorStop = { at: number; word: string };

export type Factor = {
  id: FactorId;
  name: string;
  neg: string;
  pos: string;
  value: number;
  stops?: FactorStop[];
};

export type AttentionBox = {
  id: string;
  lineIndex: number;
  wordStart: number;
  wordEnd: number;
  weight: number;
};

export type SourceDoc = {
  id: string;
  name: string;
  kind: DocKind;
  text: string;
  spans: string[];
};

export type FactorHits = Partial<Record<FactorId, boolean>>;

export type Reading = {
  id: FactorId;
  name: string;
  word: string;
  pct: number;
  contradicts: boolean;
};

export type PassageBox = { from: number; to: number; weight: number };

export type CurveView = "closed" | "ring" | FactorId;

export const FACTORS: Factor[] = [
  {
    id: "tono",
    name: "tono",
    neg: "irónico",
    pos: "asombroso",
    stops: [
      { at: -0.55, word: "tierno" },
      { at: 0.42, word: "sombrío" },
    ],
    value: -0.58,
  },
  { id: "tension", name: "tensión", neg: "suelta", pos: "tensa", value: 0.81 },
  { id: "ritmo", name: "ritmo", neg: "comprimido", pos: "holgado", value: -0.36 },
  { id: "foco", name: "foco", neg: "Mara", pos: "narrador", value: -0.78 },
  { id: "modo", name: "modo", neg: "acción", pos: "descripción", value: -0.9 },
  { id: "distancia", name: "distancia", neg: "cerca", pos: "lejos", value: 0.22 },
  { id: "cierre", name: "cierre", neg: "abierto", pos: "cerrado", value: -0.2 },
  { id: "sorpresa", name: "sorpresa", neg: "esperable", pos: "imprevisto", value: 0.7 },
];

export const SAMPLE_LINES = [
  "El último tranvía de la línea 4 llega vacío, salvo por una niña que no baja.",
  "Mara cuenta los asientos. Siempre son veinte. Esta noche el diecinueve no tiene sombra.",
  "La niña sostiene un boleto mojado. El destino dice: donde dejaste de mirar.",
  "Mara se sienta enfrente. No pregunta el nombre. Pregunta la hora.",
  "No hay hora, dice la niña. Hay un antes y un después del puente.",
  "El tranvía frena en medio del río. El agua no se mueve.",
  "Por la ventanilla, la ciudad se dobla como una página mal cerrada.",
  "Mara reconoce el puente. Ahí perdió a su hermano, hace tres inviernos.",
  "La niña señala el agua. Él todavía cuenta hasta diez.",
  "Un golpe seco, desde abajo. Luego otro. Al ritmo de alguien que camina.",
  "Mara apoya la mano en el vidrio. El vidrio está tibio.",
  "Si abrís la puerta, dice la niña, el boleto se cumple.",
  "Mara no abre. Dobla el boleto y se lo guarda en el puño.",
  "El diecinueve recupera su sombra. La sombra no es de Mara.",
  "El tranvía sigue. La niña ya no está. El asiento conserva el calor.",
  "En el puño, el boleto ahora dice: todavía no.",
  "Mara baja en la estación siguiente. Nadie más baja con ella.",
  "En el andén hay un reloj parado en las 3:12. La hora del puente.",
  "Alguien, lejos, termina de contar. Diez.",
];

const SAMPLE_DOC_SEEDS: Array<Omit<SourceDoc, "spans">> = [
  {
    id: "doc-mara",
    name: "Mara Varela",
    kind: "personaje",
    text: "Mara Varela conduce la línea 4 de noche.\n\nHabla poco. Cuando tiene miedo, cuenta objetos.\n\nNunca diría el nombre de su hermano en voz alta.\n\nPerdió a su hermano en el puente, hace tres inviernos.\n\nQuiere terminar el turno sin abrir la puerta del tranvía.",
  },
  {
    id: "doc-linea",
    name: "La línea 4",
    kind: "saga",
    text: "La línea 4 cruza el puente viejo a las 3:12.\n\nEsa noche el agua no corre. Los que bajan no siempre vuelven a subir.\n\nHay un boleto que cambia de destino si lo apretás demasiado.",
  },
];

export const SAMPLE_DOCS: SourceDoc[] = SAMPLE_DOC_SEEDS.map((doc) => ({
  ...doc,
  spans: splitSpans(doc.text),
}));

export function wordsOf(line: string): string[] {
  return line.split(/\s+/).filter(Boolean);
}

export function phraseOf(line: string, box: Pick<AttentionBox, "wordStart" | "wordEnd">): string {
  const words = wordsOf(line);
  const start = Math.max(0, Math.min(box.wordStart, box.wordEnd));
  const end = Math.min(words.length - 1, Math.max(box.wordStart, box.wordEnd));
  return words.slice(start, end + 1).join(" ");
}

export function coversWord(box: Pick<AttentionBox, "wordStart" | "wordEnd">, wordIndex: number): boolean {
  const start = Math.min(box.wordStart, box.wordEnd);
  const end = Math.max(box.wordStart, box.wordEnd);
  return wordIndex >= start && wordIndex <= end;
}

export function splitSpans(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .flatMap((block) => block.split(/(?<=[.!?…])\s+/))
    .map((span) => span.replace(/\s+/g, " ").trim())
    .filter((span) => span.length > 0);
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function rawLineScore(
  line: string,
  lineIndex: number,
  boxes: AttentionBox[],
  factorValue: number,
): number {
  const base = (hashString(line) % 45) + 18;
  const boost = boxes
    .filter((box) => box.lineIndex === lineIndex)
    .reduce((sum, box) => sum + box.weight * 55, 0);
  const align = ((hashString(`${line}:factor`) % 100) / 100) * 2 - 1;
  return Math.max(0, Math.min(100, base + boost + align * factorValue * 22));
}

export function rawSpanScore(span: string, factorValue: number): number {
  const base = (hashString(span) % 50) + 15;
  const align = ((hashString(`${span}:span`) % 100) / 100) * 2 - 1;
  return Math.max(0, Math.min(100, base + align * factorValue * 18));
}

export function normalizeP95(scores: number[]): number[] {
  if (scores.length === 0) return [];
  const sorted = [...scores].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const max = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? min;
  if (max - min < 1) return scores.map(() => 50);
  return scores.map((score) => Math.max(0, Math.min(100, ((score - min) / (max - min)) * 100)));
}

export function factorHit(line: string, factor: Factor): boolean {
  const roll = hashString(`${line}:${factor.id}`) % 100;
  return roll < 28 + Math.abs(factor.value) * 58;
}

export function factorReadout(factor: Factor): { word: string; pct: number } {
  const magnitude = Math.abs(factor.value);
  if (magnitude < 0.08) return { word: "neutro", pct: Math.round((1 - magnitude) * 100) };
  const marks = [{ at: -1, word: factor.neg }, ...(factor.stops ?? []), { at: 1, word: factor.pos }];
  let best = marks[0];
  if (!best) return { word: "neutro", pct: 0 };
  for (const mark of marks) {
    if (Math.abs(mark.at - factor.value) < Math.abs(best.at - factor.value)) best = mark;
  }
  return { word: best.word, pct: Math.round(magnitude * 100) };
}

const CUES: Record<string, string[]> = {
  tono: ["noche", "niña", "silencio", "miedo", "sombra"],
  tension: ["golpe", "frena", "agua", "cuenta", "puerta"],
  ritmo: ["ritmo", "siempre", "luego", "otro"],
  foco: ["mara", "niña", "narrador"],
  modo: ["dice", "señala", "abre", "pregunta", "golpe"],
  distancia: ["enfrente", "lejos", "ventanilla", "andén", "medio"],
  cierre: ["todavía", "sigue", "estación", "baja"],
  sorpresa: ["nadie", "destino", "sombra", "no tiene"],
};

export function admitFactors(lines: string[], cursor: number, factors: Factor[]): Factor[] {
  const text = lines.slice(0, Math.max(cursor, 0)).join(" ").toLowerCase();
  const ranked = factors.map((factor) => {
    const hits = (CUES[factor.id] ?? []).reduce((sum, cue) => sum + Math.max(0, text.split(cue).length - 1), 0);
    const salt = (hashString(`${Math.min(cursor, 12)}:${factor.id}`) % 10) / 100;
    return { factor, score: hits + salt };
  });
  ranked.sort((a, b) => b.score - a.score || a.factor.name.localeCompare(b.factor.name));
  return ranked.slice(0, 5).map((item) => item.factor);
}

export function diagnose(
  lines: string[],
  cursor: number,
  boxes: AttentionBox[],
  factors: Factor[],
  steers: FactorId[],
): Reading[] {
  const pins = boxes.filter((box) => box.lineIndex < cursor);
  if (pins.length === 0) return [];
  const text = pins.map((box) => phraseOf(lines[box.lineIndex] ?? "", box)).join(" ");
  const readings: Reading[] = [];
  for (const factor of admitFactors(lines, cursor, factors)) {
    const align = ((hashString(`${text}:${factor.id}:read`) % 100) / 100) * 2 - 1;
    const readout = factorReadout({ ...factor, value: align });
    const steered = steers.includes(factor.id);
    const contradicts =
      steered && Math.sign(align) !== Math.sign(factor.value) && Math.abs(align) > 0.25 && Math.abs(factor.value) > 0.15;
    if (steered && !contradicts) continue;
    readings.push({
      id: factor.id,
      name: factor.name,
      word: readout.word,
      pct: readout.pct,
      contradicts,
    });
  }
  return readings.slice(0, 4);
}

export function passageBoxes(
  lines: string[],
  cursor: number,
  attention: AttentionBox[],
  factorValue: number,
): PassageBox[] {
  if (cursor < 4) return [];
  const scores = lines.slice(0, cursor).map((line, index) => rawLineScore(line, index, attention, factorValue));
  const bands = 3;
  const size = Math.ceil(cursor / bands);
  const regions: PassageBox[] = [];
  for (let band = 0; band < bands; band += 1) {
    const from = band * size;
    const to = Math.min(cursor, from + size);
    if (to <= from) continue;
    const slice = scores.slice(from, to);
    const mean = slice.reduce((sum, score) => sum + score, 0) / slice.length;
    regions.push({ from, to, weight: Math.round((mean / 30) * 100) / 100 });
  }
  return regions;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function sparkProfile(seed: string, count = 12): number[] {
  const bars: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const noise = (hashString(`${seed}:${index}`) % 1000) / 1000;
    const shape = 0.3 + 0.7 * Math.abs(Math.sin(index * 0.9 + noise * 5));
    bars.push(Math.min(1, 0.15 + noise * shape));
  }
  return bars;
}

export function barColor(percent: number): string {
  const t = percent / 100;
  if (t < 0.45) return mix("#5a463f", "#ff7a3c", t / 0.45);
  return mix("#ff7a3c", "#ff2d2d", (t - 0.45) / 0.55);
}

function mix(from: string, to: string, amount: number): string {
  const a = hex(from);
  const b = hex(to);
  const t = clamp(amount, 0, 1);
  const channel = (index: number) => Math.round(a[index] + (b[index] - a[index]) * t);
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
}

function hex(color: string): [number, number, number] {
  const value = color.slice(1);
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}
