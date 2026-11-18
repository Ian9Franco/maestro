import {
  createProjectRecord,
  normalizeGeneration,
  normalizeProject,
  toSummary,
  type NarrativeRepository,
} from "./repository";
import type { GenerationRecord, ProjectRecord } from "./types";

export function createMemoryRepository(now: () => string = () => new Date().toISOString()): NarrativeRepository {
  const projects = new Map<string, ProjectRecord>();
  const generations: GenerationRecord[] = [];

  return {
    async listProjects() {
      return [...projects.values()]
        .map(toSummary)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    },
    async createProject(name) {
      const project = createProjectRecord(name, now());
      projects.set(project.id, project);
      return project;
    },
    async getProject(id) {
      const project = projects.get(id);
      return project ? structuredClone(project) : null;
    },
    async saveProject(project) {
      const normalized = normalizeProject(project);
      if (!normalized) return;
      projects.set(normalized.id, normalized);
    },
    async deleteProject(id) {
      projects.delete(id);
      for (let index = generations.length - 1; index >= 0; index -= 1) {
        if (generations[index]?.projectId === id) generations.splice(index, 1);
      }
    },
    async listGenerations(projectId) {
      return generations
        .filter((record) => record.projectId === projectId)
        .map((record) => structuredClone(record))
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    },
    async appendGeneration(record) {
      const normalized = normalizeGeneration(record);
      if (!normalized) return;
      generations.push(normalized);
    },
  };
}
