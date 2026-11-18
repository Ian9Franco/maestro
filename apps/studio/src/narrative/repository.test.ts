import assert from "node:assert/strict";
import test from "node:test";
import { documentFromJSON, docWithParagraph, insertText, markGenerated, readGenerated } from "./document";
import { createMemoryRepository } from "./memory-repository";
import { assemblePrompt } from "./prompt";
import type { GenerationRecord } from "./types";

test("el proyecto guarda el documento, no la posición del bloque", async () => {
  const repo = createMemoryRepository(() => "2026-11-18T00:00:00.000Z");
  const project = await repo.createProject("Historia");
  let doc = docWithParagraph("uno dos");
  doc = markGenerated(doc, 5, 8, "block-1", "gen-1");
  doc = insertText(doc, 1, "cero ");
  await repo.saveProject({ ...project, document: doc.toJSON(), format: "Prosa.", style: "Seco." });
  const loaded = await repo.getProject(project.id);
  assert.ok(loaded);
  assert.equal(readGenerated(documentFromJSON(loaded.document), "block-1")?.text, "dos");
  assert.equal("lines" in loaded, false);
  assert.equal(loaded.format, "Prosa.");
});

test("una toma rechazada queda en el historial sin índices", async () => {
  const repo = createMemoryRepository(() => "2026-11-18T00:00:00.000Z");
  const project = await repo.createProject("Historia");
  const doc = docWithParagraph("Empieza la escena.");
  const prompt = assemblePrompt(doc, 1, "Prosa.", "", []);
  const record = {
    id: "gen-1",
    projectId: project.id,
    blockId: "block-1",
    parentId: null,
    prompt,
    output: "Alguien entra.",
    model: "pending",
    params: { maxWords: 400 },
    status: "rejected",
    createdAt: "2026-11-18T00:00:01.000Z",
    from: 4,
    to: 18,
  } as GenerationRecord & { from: number; to: number };
  await repo.appendGeneration(record);
  const [stored] = await repo.listGenerations(project.id);
  assert.ok(stored);
  assert.equal(stored.output, "Alguien entra.");
  assert.equal(stored.status, "rejected");
  assert.equal(stored.blockId, "block-1");
  assert.equal("from" in stored, false);
  assert.equal("to" in stored, false);
  await repo.deleteProject(project.id);
  assert.equal((await repo.listGenerations(project.id)).length, 0);
  assert.equal(await repo.getProject(project.id), null);
});
