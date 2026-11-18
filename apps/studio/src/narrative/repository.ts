import type { JSONContent } from "@tiptap/core";
import { defaultDials, normalizeDials } from "./dials";
import { emptyStyleMix, normalizeStyleMix } from "./style";
import {
  EMPTY_DOCUMENT,
  GENERATION_STATUSES,
  PROJECT_VERSION,
  isContextKind,
  type ContextDocument,
  type GenerationRecord,
  type GenerationStatus,
  type ProjectRecord,
  type ProjectSummary,
  type PromptDraft,
} from "./types";

/**
 * Hoy lo implementa IndexedDB, en este navegador.
 * projects y generations son registros separados.
 * Las fichas viven en el proyecto hasta que haga falta consultarlas solas.
 * Las referencias no se copian acá: están en el JSON del documento.
 */
export interface NarrativeRepository {
  listProjects(): Promise<ProjectSummary[]>;
  createProject(name: string): Promise<ProjectRecord>;
  getProject(id: string): Promise<ProjectRecord | null>;
  saveProject(project: ProjectRecord): Promise<void>;
  deleteProject(id: string): Promise<void>;
  listGenerations(projectId: string): Promise<GenerationRecord[]>;
  appendGeneration(record: GenerationRecord): Promise<void>;
}

export function createProjectRecord(name: string, now: string, id = crypto.randomUUID()): ProjectRecord {
  return {
    version: PROJECT_VERSION,
    id,
    name: name.trim() || "Sin título",
    format: "",
    style: "",
    styleMix: emptyStyleMix(),
    dials: defaultDials(),
    influence: [],
    document: EMPTY_DOCUMENT,
    contextDocs: [],
    cursor: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function toSummary(project: ProjectRecord): ProjectSummary {
  return { id: project.id, name: project.name, updatedAt: project.updatedAt };
}

export function normalizeProject(value: unknown): ProjectRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ProjectRecord>;
  if (typeof record.id !== "string" || record.id.length === 0) return null;
  if (!record.document || typeof record.document !== "object") return null;
  return {
    version: PROJECT_VERSION,
    id: record.id,
    name: typeof record.name === "string" && record.name.trim() ? record.name : "Sin título",
    format: typeof record.format === "string" ? record.format : "",
    style: typeof record.style === "string" ? record.style : "",
    styleMix: normalizeStyleMix(record.styleMix),
    dials: normalizeDials(record.dials),
    influence: Array.isArray(record.influence) ? record.influence.filter((item): item is string => typeof item === "string") : [],
    document: record.document as JSONContent,
    contextDocs: Array.isArray(record.contextDocs) ? record.contextDocs.flatMap((item) => normalizeDoc(item) ?? []) : [],
    cursor: typeof record.cursor === "number" ? record.cursor : null,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date(0).toISOString(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString(),
  };
}

export function normalizeGeneration(value: unknown): GenerationRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<GenerationRecord> & { from?: unknown; to?: unknown };
  if (typeof record.id !== "string" || typeof record.projectId !== "string" || typeof record.blockId !== "string") {
    return null;
  }
  if (typeof record.output !== "string") return null;
  const prompt = normalizePrompt(record.prompt);
  if (!prompt) return null;
  if (!isStatus(record.status)) return null;
  const maxWords = record.params && typeof record.params.maxWords === "number" ? record.params.maxWords : 400;
  return {
    id: record.id,
    projectId: record.projectId,
    blockId: record.blockId,
    parentId: typeof record.parentId === "string" ? record.parentId : null,
    prompt,
    output: record.output,
    model: typeof record.model === "string" ? record.model : null,
    params: { maxWords },
    status: record.status,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date(0).toISOString(),
  };
}

function normalizeDoc(value: unknown): ContextDocument | null {
  if (!value || typeof value !== "object") return null;
  const doc = value as Partial<ContextDocument>;
  if (typeof doc.id !== "string" || typeof doc.body !== "string") return null;
  return {
    id: doc.id,
    name: typeof doc.name === "string" && doc.name.trim() ? doc.name : "Sin título",
    kind: isContextKind(doc.kind) ? doc.kind : "notas",
    body: doc.body,
    included: doc.included !== false,
    protected: doc.protected !== false,
  };
}

function normalizePrompt(value: unknown): PromptDraft | null {
  if (!value || typeof value !== "object") return null;
  const prompt = value as Partial<PromptDraft>;
  if (typeof prompt.system !== "string" || typeof prompt.instruction !== "string") return null;
  if (!Array.isArray(prompt.contextDocs) || !Array.isArray(prompt.references) || !Array.isArray(prompt.excluded)) {
    return null;
  }
  return {
    system: prompt.system,
    format: typeof prompt.format === "string" ? prompt.format : "",
    style: typeof prompt.style === "string" ? prompt.style : "",
    contextDocs: prompt.contextDocs.flatMap((item) => normalizeFragment(item) ?? []),
    recent: prompt.recent ? normalizeFragment(prompt.recent) : null,
    references: prompt.references.flatMap((item) => normalizeFragment(item) ?? []),
    instruction: prompt.instruction,
    excluded: prompt.excluded.flatMap((item) => normalizeFragment(item) ?? []),
  };
}

function normalizeFragment(value: unknown): PromptDraft["contextDocs"][number] | null {
  if (!value || typeof value !== "object") return null;
  const fragment = value as Partial<PromptDraft["contextDocs"][number]>;
  if (typeof fragment.label !== "string" || typeof fragment.text !== "string" || typeof fragment.reason !== "string") {
    return null;
  }
  return { label: fragment.label, text: fragment.text, reason: fragment.reason };
}

function isStatus(value: unknown): value is GenerationStatus {
  return typeof value === "string" && GENERATION_STATUSES.some((status) => status === value);
}
