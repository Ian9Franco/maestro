import type { StyleWeight } from "./types";

export const STYLE_TRAITS = [
  { id: "cinematografico", name: "Cinematográfico" },
  { id: "noir", name: "Noir" },
  { id: "introspectivo", name: "Introspectivo" },
  { id: "thriller", name: "Thriller" },
  { id: "accion", name: "Acción" },
  { id: "humor", name: "Humor" },
  { id: "atmosferico", name: "Atmosférico" },
] as const;

export type StyleId = (typeof STYLE_TRAITS)[number]["id"];

export const INSPIRATIONS = [
  {
    id: "ciudad-nocturna",
    name: "Ciudad nocturna",
    weights: { cinematografico: 80, noir: 65, introspectivo: 40, humor: 20, atmosferico: 70, thriller: 45, accion: 30 },
  },
  {
    id: "accion-contenida",
    name: "Acción contenida",
    weights: { cinematografico: 50, noir: 20, introspectivo: 25, humor: 0, atmosferico: 30, thriller: 40, accion: 80 },
  },
  {
    id: "moral-en-voz-baja",
    name: "Moral en voz baja",
    weights: { cinematografico: 35, noir: 30, introspectivo: 80, humor: 10, atmosferico: 40, thriller: 15, accion: 10 },
  },
] as const;

export type InspirationId = (typeof INSPIRATIONS)[number]["id"];

export function emptyStyleMix(): StyleWeight[] {
  return STYLE_TRAITS.map((trait) => ({ id: trait.id, name: trait.name, weight: 0 }));
}

export function mixFromWeights(weights: Partial<Record<StyleId, number>>): StyleWeight[] {
  return STYLE_TRAITS.map((trait) => ({
    id: trait.id,
    name: trait.name,
    weight: clampWeight(weights[trait.id] ?? 0),
  }));
}

export function normalizeStyleMix(value: unknown): StyleWeight[] {
  const given = new Map<string, number>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const id = "id" in item ? item.id : null;
      const weight = "weight" in item ? item.weight : null;
      if (typeof id === "string" && typeof weight === "number") given.set(id, clampWeight(weight));
    }
  }
  return STYLE_TRAITS.map((trait) => ({
    id: trait.id,
    name: trait.name,
    weight: given.get(trait.id) ?? 0,
  }));
}

export function describeStyle(mix: StyleWeight[]): string {
  return mix
    .filter((trait) => trait.weight > 0)
    .map((trait) => `${trait.name} ${Math.round(trait.weight)}%`)
    .join(" · ");
}

export function weightOf(mix: StyleWeight[], id: StyleId): number {
  return mix.find((trait) => trait.id === id)?.weight ?? 0;
}

function clampWeight(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
