import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";

export const ghostPreviewKey = new PluginKey("ghostPreview");

export function createGhostPreview() {
  return Extension.create({
    name: "ghostPreview",
    addStorage() {
      return { text: "", hidden: false };
    },
    addProseMirrorPlugins() {
      const storage = this.storage as { text: string; hidden: boolean };
      return [
        new Plugin({
          key: ghostPreviewKey,
          props: {
            decorations(state) {
              const text = storage.text.trim();
              if (!text || storage.hidden || !state.selection.empty) return null;
              const widget = Decoration.widget(
                state.selection.from,
                () => {
                  const span = document.createElement("span");
                  span.className = "ghost-preview";
                  span.title = "Propuesta mock, sin modelo";
                  span.textContent = text;
                  return span;
                },
                { side: 1, ignoreSelection: true, key: text, marks: [] },
              );
              return DecorationSet.create(state.doc, [widget]);
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
