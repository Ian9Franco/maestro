import type { JSONContent } from "@tiptap/core";
import type { NarrativeDials } from "./dials";

/**
 * El documento guardado es el JSON de ProseMirror.
 * Un bloque generado y una referencia son marcas o nodos con id.
 * No se persisten índices de caracteres: editar el texto anterior los invalida.
 */
export const PROJECT_VERSION = 1;

export const EMPTY_DOCUMENT: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export const REFERENCE_INTENTS = ["textual", "objeto", "promesa", "conflicto", "relacion", "hecho"] as const;

export type ReferenceIntent = (typeof REFERENCE_INTENTS)[number];

export const CONTEXT_KINDS = ["personaje", "saga", "lore", "notas"] as const;

export type ContextKind = (typeof CONTEXT_KINDS)[number];

export type ContextDocument = {
  id: string;
  name: string;
  kind: ContextKind;
  body: string;
  included: boolean;
  protected: boolean;
};

export type StyleWeight = {
  id: string;
  name: string;
  weight: number;
};

export type ProjectRecord = {
  version: typeof PROJECT_VERSION;
  id: string;
  name: string;
  format: string;
  style: string;
  styleMix: StyleWeight[];
  dials: NarrativeDials;
  influence: string[];
  document: JSONContent;
  contextDocs: ContextDocument[];
  cursor: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectSummary = {
  id: string;
  name: string;
  updatedAt: string;
};

export type PromptFragment = {
  label: string;
  text: string;
  reason: string;
};

export type PromptDraft = {
  system: string;
  format: string;
  style: string;
  contextDocs: PromptFragment[];
  recent: PromptFragment | null;
  references: PromptFragment[];
  instruction: string;
  excluded: PromptFragment[];
};

export const GENERATION_STATUSES = ["streaming", "accepted", "rejected", "discarded"] as const;

export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export type GenerationParams = {
  maxWords: number;
};

/**
 * Una toma rechazada se borra del documento y queda acá.
 * La posición no se guarda: el bloque se reconoce por blockId, que es el id de la marca.
 */
export type GenerationRecord = {
  id: string;
  projectId: string;
  blockId: string;
  parentId: string | null;
  prompt: PromptDraft;
  output: string;
  model: string | null;
  params: GenerationParams;
  status: GenerationStatus;
  createdAt: string;
};

export function isReferenceIntent(value: unknown): value is ReferenceIntent {
  return typeof value === "string" && REFERENCE_INTENTS.some((intent) => intent === value);
}

export function isContextKind(value: unknown): value is ContextKind {
  return typeof value === "string" && CONTEXT_KINDS.some((kind) => kind === value);
}
