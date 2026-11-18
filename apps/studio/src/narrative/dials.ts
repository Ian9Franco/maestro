import { STYLE_TRAITS, weightOf, type StyleId } from "./style";
import type { StyleWeight } from "./types";

/**
 * Lo que se abre al tocar el punto de inserción.
 * `mode` es el registro (acción, noir…) y `amount` cuánto pesa.
 * El resto son ejes de 0 a 100: arrastrar el punto hacia ese eje lo sube o lo baja.
 */
export type NarrativeDials = {
  mode: StyleId;
  amount: number;
  tension: number;
  surprise: number;
  pace: number;
  distance: number;
};

export const DIAL_IDS = ["mode", "tension", "surprise", "pace", "distance"] as const;
export type DialId = (typeof DIAL_IDS)[number];

/** Desplazamiento desde el punto, en px. El orden dibuja el abanico de las capturas. */
export const SPOKES: { id: DialId; x: number; y: number }[] = [
  { id: "mode", x: 20, y: -32 },
  { id: "tension", x: -170, y: 84 },
  { id: "surprise", x: 176, y: 76 },
  { id: "pace", x: 86, y: 156 },
  { id: "distance", x: -6, y: 184 },
];

export function defaultDials(): NarrativeDials {
  return { mode: "accion", amount: 40, tension: 35, surprise: 30, pace: 50, distance: 40 };
}

export function normalizeDials(value: unknown): NarrativeDials {
  const base = defaultDials();
  if (!value || typeof value !== "object") return base;
  const record = value as Partial<NarrativeDials>;
  const mode = STYLE_TRAITS.some((trait) => trait.id === record.mode) ? (record.mode as StyleId) : base.mode;
  return {
    mode,
    amount: clamp(record.amount, base.amount),
    tension: clamp(record.tension, base.tension),
    surprise: clamp(record.surprise, base.surprise),
    pace: clamp(record.pace, base.pace),
    distance: clamp(record.distance, base.distance),
  };
}

export function dialValue(dials: NarrativeDials, id: DialId): number {
  return id === "mode" ? dials.amount : dials[id];
}

export function withDial(dials: NarrativeDials, id: DialId, value: number): NarrativeDials {
  const next = clamp(value, 0);
  if (id === "mode") return { ...dials, amount: next };
  return { ...dials, [id]: next };
}

export function cycleMode(mode: StyleId): StyleId {
  const index = STYLE_TRAITS.findIndex((trait) => trait.id === mode);
  return STYLE_TRAITS[(index + 1) % STYLE_TRAITS.length]!.id;
}

export function dialCaption(dials: NarrativeDials, id: DialId): string {
  if (id === "mode") {
    const name = STYLE_TRAITS.find((trait) => trait.id === dials.mode)?.name ?? dials.mode;
    return `mode: ${name.toLowerCase()} ${dials.amount}%`;
  }
  const value = dials[id];
  if (id === "tension") return `tensión: ${value < 30 ? "muy relajada" : value > 70 ? "muy tensa" : "media"}`;
  if (id === "surprise") return `sorpresa: ${value < 30 ? "esperable" : value > 70 ? "muy inesperada" : "inesperada"}`;
  if (id === "pace") return `ritmo: ${value < 30 ? "comprimido" : value > 70 ? "expandido" : "medio"}`;
  return `distancia: ${value < 30 ? "vista de afuera" : value > 70 ? "mente del personaje" : "entre las dos"}`;
}

type Point = { x: number; y: number };

/** Qué eje mira el arrastre, y cuánto (0 a 100) según qué tan lejos se llegó por esa línea. */
export function readDial(hub: Point, point: Point): { id: DialId; value: number } {
  const angle = Math.atan2(point.y - hub.y, point.x - hub.x);
  let id: DialId = "tension";
  let best = Infinity;
  for (const spoke of SPOKES) {
    let diff = Math.abs(angle - Math.atan2(spoke.y, spoke.x));
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff < best) {
      best = diff;
      id = spoke.id;
    }
  }
  const spoke = SPOKES.find((item) => item.id === id)!;
  const end = { x: hub.x + spoke.x, y: hub.y + spoke.y };
  const vx = end.x - hub.x;
  const vy = end.y - hub.y;
  const length = vx * vx + vy * vy || 1;
  const along = ((point.x - hub.x) * vx + (point.y - hub.y) * vy) / length;
  return { id, value: clamp(Math.round(along * 100), 0) };
}

/** El modo y los ejes empujan la mezcla. Con todo en neutro, no cambia el orden de las redacciones. */
export function weightsForDials(weights: StyleWeight[], dials: NarrativeDials): StyleWeight[] {
  return weights.map((trait) => {
    let weight = trait.weight;
    if (dials.amount >= 50 && trait.id === dials.mode) weight = Math.max(weight, dials.amount);
    if (dials.tension >= 60 && (trait.id === "thriller" || trait.id === "accion")) weight = Math.max(weight, dials.tension);
    if (dials.distance >= 60 && trait.id === "introspectivo") weight = Math.max(weight, dials.distance);
    if (dials.pace <= 30 && trait.id === "atmosferico") weight = Math.max(weight, 70);
    if (dials.pace >= 70 && trait.id === "accion") weight = Math.max(weight, dials.pace);
    return { ...trait, weight };
  });
}

export function rankedVariants<T extends { trait: StyleId }>(variants: T[], weights: StyleWeight[], dials: NarrativeDials): T[] {
  const tuned = weightsForDials(weights, dials);
  return [...variants].sort((a, b) => weightOf(tuned, b.trait) - weightOf(tuned, a.trait));
}

function clamp(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}
