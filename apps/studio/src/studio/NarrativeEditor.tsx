"use client";

import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import { useRef, useState } from "react";
import { contentOrEmpty } from "@/narrative/document";
import { createNarrativeExtensions } from "@/narrative/extensions";

export function NarrativeEditor({
  projectId,
  initial,
  onChange,
}: {
  projectId: string;
  initial: JSONContent;
  onChange: (document: JSONContent) => void;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
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
    },
    [projectId, extensions, content],
  );

  return <EditorContent editor={editor} />;
}
