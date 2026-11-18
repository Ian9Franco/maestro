"use client";

import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { contentOrEmpty } from "@/narrative/document";
import { createNarrativeExtensions, ghostPreviewKey } from "@/narrative/extensions";

export function NarrativeEditor({
  projectId,
  initial,
  initialCursor,
  placeAtEnd,
  preview,
  onChange,
  onCursor,
}: {
  projectId: string;
  initial: JSONContent;
  initialCursor: number | null;
  placeAtEnd: boolean;
  preview: string;
  onChange: (document: JSONContent) => void;
  onCursor: (cursor: number) => void;
}) {
  const onChangeRef = useRef(onChange);
  const onCursorRef = useRef(onCursor);
  const cursorRef = useRef(initialCursor);
  const atEndRef = useRef(placeAtEnd);
  const placed = useRef(false);
  onChangeRef.current = onChange;
  onCursorRef.current = onCursor;
  cursorRef.current = initialCursor;
  atEndRef.current = placeAtEnd;
  const [extensions] = useState(createNarrativeExtensions);
  const [content] = useState(() => contentOrEmpty(initial));
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      content,
      editorProps: {
        attributes: {
          class: "narrative-editor",
          "aria-label": "Manuscrito",
          spellcheck: "true",
        },
      },
      onUpdate: ({ editor: current }) => {
        onChangeRef.current(current.getJSON());
      },
      onSelectionUpdate: ({ editor: current }) => {
        onCursorRef.current(current.state.selection.from);
      },
    },
    [projectId, extensions, content],
  );

  useEffect(() => {
    if (!editor || placed.current) return;
    placed.current = true;
    const stored = cursorRef.current;
    if (typeof stored === "number") {
      const max = editor.state.doc.content.size;
      editor.commands.setTextSelection(Math.max(0, Math.min(stored, max)));
    } else if (atEndRef.current) {
      editor.commands.focus("end");
    }
    onCursorRef.current(editor.state.selection.from);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const storage = (editor.storage as { ghostPreview?: { text: string } }).ghostPreview;
    if (!storage || storage.text === preview) return;
    storage.text = preview;
    editor.view.dispatch(editor.state.tr.setMeta(ghostPreviewKey, preview));
  }, [editor, preview]);

  return <EditorContent editor={editor} />;
}
