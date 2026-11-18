import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { endOfBlock } from "./document";
import { splitSentences } from "./writer";

export const ghostPreviewKey = new PluginKey("ghostPreview");

type GhostStorage = { text: string; hidden: boolean; accept: number };

export function createGhostPreview() {
  return Extension.create({
    name: "ghostPreview",
    addStorage() {
      return { text: "", hidden: false, accept: 0 } satisfies GhostStorage;
    },
    addProseMirrorPlugins() {
      const storage = this.storage as GhostStorage;
      return [
        new Plugin({
          key: ghostPreviewKey,
          props: {
            decorations(state) {
              const caret = Decoration.widget(
                state.selection.from,
                () => {
                  const bar = document.createElement("span");
                  bar.className = "insertion-hub";
                  bar.title = "Punto de inserción. Clic para el modo, arrastrá hacia una característica.";
                  return bar;
                },
                { side: -1, ignoreSelection: true, key: "insertion-caret" },
              );
              const text = storage.text.trim();
              if (!text || storage.hidden || !state.selection.empty) return DecorationSet.create(state.doc, [caret]);
              const ghostAt = endOfBlock(state.doc, state.selection.from);
              const sentences = splitSentences(text);
              const widget = Decoration.widget(
                ghostAt,
                () => {
                  const span = document.createElement("span");
                  span.className = "ghost-preview";
                  span.title = "Arrastrá hasta donde quieras aceptar";
                  sentences.forEach((sentence, index) => {
                    const line = document.createElement("span");
                    line.className = "ghost-sentence";
                    line.dataset.ghostIndex = String(index);
                    if (storage.accept > index) line.dataset.on = "";
                    line.textContent = `${index === 0 ? "" : " "}${sentence}`;
                    span.append(line);
                  });
                  return span;
                },
                { side: 1, ignoreSelection: true, key: `${text}:${storage.accept}`, marks: [] },
              );
              return DecorationSet.create(state.doc, [caret, widget]);
            },
          },
        }),
      ];
    },
  });
}

export const GeneratedMark = Mark.create({
  name: "generated",
  inclusive: false,
  keepOnSplit: true,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-block-id"),
        renderHTML: (attributes) => ({ "data-block-id": attributes.id }),
      },
      generationId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-generation-id"),
        renderHTML: (attributes) => ({ "data-generation-id": attributes.generationId }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-generated]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-generated": "", class: "generated" }), 0];
  },
});

export const ReferenceMark = Mark.create({
  name: "reference",
  inclusive: false,
  keepOnSplit: true,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-reference-id"),
        renderHTML: (attributes) => ({ "data-reference-id": attributes.id }),
      },
      intent: {
        default: "textual",
        parseHTML: (element) => element.getAttribute("data-intent") ?? "textual",
        renderHTML: (attributes) => ({ "data-intent": attributes.intent }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-reference]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-reference": "", class: "reference" }), 0];
  },
});

export const ReferenceAnchor = Node.create({
  name: "referenceAnchor",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-anchor-id"),
        renderHTML: (attributes) => ({ "data-anchor-id": attributes.id }),
      },
      referenceId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-reference-id"),
        renderHTML: (attributes) => ({ "data-reference-id": attributes.referenceId }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-reference-anchor]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-reference-anchor": "", class: "reference-anchor" })];
  },
});

export function createNarrativeExtensions() {
  return [
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      link: false,
      listItem: false,
      listKeymap: false,
      orderedList: false,
      strike: false,
      underline: false,
    }),
    GeneratedMark,
    ReferenceMark,
    ReferenceAnchor,
    createGhostPreview(),
  ];
}
