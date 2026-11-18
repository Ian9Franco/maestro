import type { Node as ProseNode } from "@tiptap/pm/model";
import { localPassage, readReferences, sameBlock } from "./document";
import type { ContextDocument, PromptDraft, PromptFragment } from "./types";

export const LOCAL_PASSAGE_BUDGET = 2400;

export const SYSTEM_INSTRUCTION =
  "Sos el escritor de este documento. Continuá la prosa en el punto de inserción, en el idioma del texto ya escrito. No reescribas lo aceptado. No copies una referencia salvo que su intención sea textual. No contradigas los documentos incluidos.";

export const GENERATION_INSTRUCTION =
  "Escribí un bloque narrativo nuevo, de entre 150 y 400 palabras, a partir del cursor.";

export function assemblePrompt(
  doc: ProseNode,
  cursor: number,
  format: string,
  style: string,
  docs: ContextDocument[],
): PromptDraft {
  const passage = localPassage(doc, cursor, LOCAL_PASSAGE_BUDGET);
  const excluded: PromptFragment[] = [];
  const recent =
    passage.text.length > 0
      ? {
          label: "Texto anterior al cursor",
          text: passage.text,
          reason: passage.trimmed ? "Recencia, recortado al presupuesto local." : "Recencia: texto anterior al cursor.",
        }
      : null;
  if (passage.trimmed) {
    excluded.push({
      label: "Texto anterior fuera de la ventana",
      text: "",
      reason: "Supera el presupuesto de recencia.",
    });
  }

  const contextDocs: PromptFragment[] = [];
  for (const item of docs) {
    const label = item.name.trim() || "Sin título";
    if (!item.included) {
      excluded.push({ label, text: item.body, reason: "El usuario no lo incluyó." });
      continue;
    }
    if (item.body.trim().length === 0) {
      excluded.push({ label, text: "", reason: "No tiene texto." });
      continue;
    }
    contextDocs.push({
      label,
      text: item.body.trim(),
      reason: item.protected
        ? "Documentación incluida y protegida contra el recorte."
        : "Documentación incluida por el usuario.",
    });
  }

  const references: PromptFragment[] = [];
  for (const reference of readReferences(doc)) {
    const label = `Referencia · ${reference.intent}`;
    if (reference.anchorPos === null) {
      excluded.push({ label, text: reference.text, reason: "No tiene ancla en el documento." });
      continue;
    }
    if (!sameBlock(doc, cursor, reference.anchorPos)) {
      excluded.push({ label, text: reference.text, reason: "El ancla no está en el punto de inserción." });
      continue;
    }
    if (reference.text.trim().length === 0) {
      excluded.push({ label, text: "", reason: "La referencia no tiene texto." });
      continue;
    }
    references.push({
      label,
      text: reference.text,
      reason: "Referencia manual anclada al punto de inserción.",
    });
  }

  return {
    system: SYSTEM_INSTRUCTION,
    format: format.trim(),
    style: style.trim(),
    contextDocs,
    recent,
    references,
    instruction: GENERATION_INSTRUCTION,
    excluded,
  };
}

const SECTIONS: Array<[string, (draft: PromptDraft) => string]> = [
  ["SISTEMA", (draft) => draft.system],
  ["FORMATO", (draft) => draft.format],
  ["ESTILO", (draft) => draft.style],
  ["DOCUMENTACIÓN", (draft) => draft.contextDocs.map(renderFragment).join("\n")],
  ["FRAGMENTO RECIENTE", (draft) => (draft.recent ? renderFragment(draft.recent) : "")],
  ["REFERENCIAS", (draft) => draft.references.map(renderFragment).join("\n")],
  ["INSTRUCCIÓN", (draft) => draft.instruction],
];

export function renderPrompt(draft: PromptDraft): string {
  return SECTIONS.flatMap(([heading, read]) => {
    const body = read(draft).trim();
    if (!body) return [];
    return [`${heading}\n${body}`];
  }).join("\n\n");
}

function renderFragment(fragment: PromptFragment): string {
  return `- ${fragment.label}: ${fragment.text}\n  ${fragment.reason}`;
}
