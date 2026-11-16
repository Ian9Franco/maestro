import {
  type AttentionBox,
  type Factor,
  type FactorId,
  type SourceDoc,
  factorReadout,
  hashString,
  phraseOf,
  rawSpanScore,
} from "@/lib/text";

export type BeatContext = {
  source: string;
  text: string;
};

export type BeatAttention = {
  text: string;
  weight: number;
  line: number;
};

export type Beat = {
  rendered: string;
  sentence: string;
  attention: BeatAttention[];
  context: BeatContext[];
  rumbo: string;
};

type BeatInput = {
  lines: string[];
  cursor: number;
  boxes: AttentionBox[];
  factors: Factor[];
  docs: SourceDoc[];
  activeFactor: FactorId;
  variant: number;
};

export function composeBeat(input: BeatInput): Beat {
  const prefix = input.lines.slice(Math.max(0, input.cursor - 8), input.cursor);
  const attention = input.boxes
    .filter((box) => box.lineIndex < input.cursor)
    .map((box) => ({
      text: phraseOf(input.lines[box.lineIndex] ?? "", box),
      weight: box.weight,
      line: box.lineIndex + 1,
    }))
    .filter((item) => item.text.length > 0)
    .sort((a, b) => b.weight - a.weight);

  const steer = input.factors.find((factor) => factor.id === input.activeFactor)?.value ?? 0;
  const context = topContext(input.docs, steer);
  const rumbo = input.factors
    .map((factor) => {
      const readout = factorReadout(factor);
      return `${factor.name} ${readout.word} ${readout.pct}%`;
    })
    .join(" · ");

  const rendered = [
    "SISTEMA",
    "Sos el escritor de la mesa. Devolvé una sola oración nueva, en español, rioplatense.",
    "No reescribas el pasado. No expliques lo que hacés.",
    "",
    "CANON",
    context.length > 0
      ? context.map((item) => `- ${item.source}: ${item.text}`).join("\n")
      : "- (sin documentos)",
    "",
    "PREFIJO",
    prefix.length > 0 ? prefix.map((line, index) => `${input.cursor - prefix.length + index + 1}. ${line}`).join("\n") : "(todavía no hay texto)",
    "",
    "ATENCIÓN",
    attention.length > 0
      ? attention.map((item) => `- «${item.text}» · peso ${item.weight.toFixed(2)} · línea ${item.line}`).join("\n")
      : "- (ninguna frase fijada)",
    "",
    "RUMBO",
    rumbo || "(sin factores)",
    "",
    "VARIANTE",
    String(input.variant),
    "",
    "DIRECTIVA",
    attention.length > 0
      ? "La oración nueva tiene que hacer pesar las frases de atención, de mayor a menor peso. El rumbo tiñe el verbo. El canon no se contradice."
      : "No hay frase fijada. Seguí el prefijo y el canon, teñido por el rumbo.",
  ].join("\n");

  return {
    rendered,
    sentence: mockSentence(rendered, attention, input.factors, context, prefix.at(-1) ?? ""),
    attention,
    context,
    rumbo,
  };
}

function topContext(docs: SourceDoc[], steer: number): BeatContext[] {
  const ranked = docs.flatMap((doc) =>
    doc.spans.map((text) => ({
      source: doc.name,
      text,
      score: rawSpanScore(text, steer),
    })),
  );
  return ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ source, text }) => ({ source, text }));
}

function mockSentence(
  rendered: string,
  attention: BeatAttention[],
  factors: Factor[],
  context: BeatContext[],
  previous: string,
): string {
  const tone = readoutWord(factors, "tono");
  const tension = readoutWord(factors, "tension");
  const focus = readoutWord(factors, "foco");
  const lead = attention[0]?.text;
  const canon = context[0];
  const canonBit = canon ? ` Entra el canon de ${canon.source}.` : "";
  const roll = hashString(rendered) % 4;
  if (!lead) {
    const open = [
      `Sin una frase fijada, lo que sigue queda ${tone}, con la tensión ${tension} y el foco en ${focus}.`,
      `La mesa no tiene atención marcada: la oración nace ${tone}, tensión ${tension}.`,
      `Como nadie fijó una frase, el narrador avanza ${tone} y la tensión sigue ${tension}.`,
      `El próximo latido, libre de frases, se escribe ${tone} mirando a ${focus}.`,
    ];
    const bridge = previous ? ` Sigue a «${tailOf(previous)}».` : "";
    return `${open[roll] ?? open[0]}${canonBit}${bridge}`;
  }
  const voiced = [
    `Después de «${lead}», la escena se inclina a ${tone} y la tensión queda ${tension}.`,
    `${focus === "Mara" ? "Mara" : "El narrador"} no suelta «${lead}»: lo que sigue es más ${tone}.`,
    `El próximo latido nace de «${lead}». El aire está ${tension} y el tono, ${tone}.`,
    `Si «${lead}» pesa, aparece una frase ${tone}, con la mirada en ${focus}.`,
  ];
  const extra = attention.length > 1 ? ` También arrastra «${attention[1]?.text}».` : "";
  const bridge = previous ? ` Sigue a «${tailOf(previous)}».` : "";
  return `${voiced[roll] ?? voiced[0]}${extra}${canonBit}${bridge}`;
}

function tailOf(line: string): string {
  const words = line
    .replace(/[«»]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(-4).join(" ");
}

function readoutWord(factors: Factor[], id: Factor["id"]): string {
  const factor = factors.find((item) => item.id === id);
  if (!factor) return id;
  return factorReadout(factor).word;
}
