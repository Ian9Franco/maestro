import { type AttentionBox, type Factor, type SourceDoc } from "@/lib/text";

export type LineOrigin = "muestra" | "mock";

export type SavedLine = {
  text: string;
  origin: LineOrigin;
  prompt: string | null;
};

export type DeskSnapshot = {
  version: 1;
  name: string;
  savedAt: string;
  lines: SavedLine[];
  boxes: AttentionBox[];
  factors: Factor[];
  docs: SourceDoc[];
  cursor: number;
  variant: number;
};

const SESSION_KEY = "maestro.session.v1";
const LIBRARY_KEY = "maestro.library.v1";

export function readSession(): DeskSnapshot | null {
  return readKey(SESSION_KEY);
}

export function writeSession(snapshot: DeskSnapshot) {
  writeKey(SESSION_KEY, snapshot);
}

export function readLibrary(): DeskSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DeskSnapshot[];
    return Array.isArray(parsed) ? parsed.filter(isSnapshot) : [];
  } catch {
    return [];
  }
}

export function writeLibrary(entries: DeskSnapshot[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries));
}

export function isSnapshot(value: unknown): value is DeskSnapshot {
  if (!value || typeof value !== "object") return false;
  const snap = value as DeskSnapshot;
  return snap.version === 1 && Array.isArray(snap.lines) && Array.isArray(snap.boxes) && Array.isArray(snap.docs);
}

function readKey(key: string): DeskSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeKey(key: string, snapshot: DeskSnapshot) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(snapshot));
}
