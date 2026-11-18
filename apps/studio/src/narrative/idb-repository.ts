import {
  createProjectRecord,
  normalizeGeneration,
  normalizeProject,
  toSummary,
  type NarrativeRepository,
} from "./repository";
import type { GenerationRecord, ProjectRecord } from "./types";

const DB_NAME = "maestro.narrative";
const DB_VERSION = 1;

export function createIdbRepository(now: () => string = () => new Date().toISOString()): NarrativeRepository {
  let opening: Promise<IDBDatabase> | null = null;
  function database() {
    opening ??= openDatabase();
    return opening;
  }

  return {
    async listProjects() {
      const db = await database();
      const rows = await getAll<unknown>(db, "projects");
      return rows
        .flatMap((row) => {
          const project = normalizeProject(row);
          return project ? [toSummary(project)] : [];
        })
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    },
    async createProject(name) {
      const project = createProjectRecord(name, now());
      const db = await database();
      await put(db, "projects", project);
      return project;
    },
    async getProject(id) {
      const db = await database();
      return normalizeProject(await getOne<unknown>(db, "projects", id));
    },
    async saveProject(project) {
      const normalized = normalizeProject(project);
      if (!normalized) return;
      const db = await database();
      await put(db, "projects", normalized);
    },
    async deleteProject(id) {
      const db = await database();
      const generations = await byProject(db, id);
      const tx = db.transaction(["projects", "generations"], "readwrite");
      tx.objectStore("projects").delete(id);
      for (const generation of generations) {
        const generationId = idOf(generation);
        if (generationId) tx.objectStore("generations").delete(generationId);
      }
      await done(tx);
    },
    async listGenerations(projectId) {
      const db = await database();
      const rows = await byProject(db, projectId);
      return rows
        .flatMap((row) => {
          const record = normalizeGeneration(row);
          return record ? [record] : [];
        })
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    },
    async appendGeneration(record) {
      const normalized = normalizeGeneration(record);
      if (!normalized) return;
      const db = await database();
      await put(db, "generations", normalized);
    },
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("generations")) {
        const store = db.createObjectStore("generations", { keyPath: "id" });
        store.createIndex("byProject", "projectId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir el archivo local."));
  });
}

function getAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  const tx = db.transaction(store, "readonly");
  return requestToPromise(tx.objectStore(store).getAll() as IDBRequest<T[]>);
}

function getOne<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  const tx = db.transaction(store, "readonly");
  return requestToPromise(tx.objectStore(store).get(key) as IDBRequest<T | undefined>);
}

function put(db: IDBDatabase, store: string, value: ProjectRecord | GenerationRecord): Promise<void> {
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  return done(tx);
}

function byProject(db: IDBDatabase, projectId: string): Promise<unknown[]> {
  const tx = db.transaction("generations", "readonly");
  const index = tx.objectStore("generations").index("byProject");
  return requestToPromise(index.getAll(projectId) as IDBRequest<unknown[]>);
}

function idOf(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("id" in value)) return null;
  return typeof value.id === "string" ? value.id : null;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falló la lectura local."));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Falló la escritura local."));
    tx.onabort = () => reject(tx.error ?? new Error("Se abortó la escritura local."));
  });
}
