"use client";

import { useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { keymap, placeholder } from "@codemirror/view";

type SqlEditorProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onExecute: () => void;
};

export function SqlEditor({ value, disabled, onChange, onExecute }: SqlEditorProps) {
  const onExecuteRef = useRef(onExecute);
  onExecuteRef.current = onExecute;

  const extensions = useMemo(
    () => [
      sql({ dialect: PostgreSQL, upperCaseKeywords: true }),
      placeholder("SELECT * FROM schema.table LIMIT 100"),
      keymap.of([
        {
          key: "Mod-Enter",
          preventDefault: true,
          run: () => {
            onExecuteRef.current();
            return true;
          },
        },
      ]),
    ],
    [],
  );

  return (
    <div className="h-72 overflow-hidden rounded-md border border-line bg-[#12181e]">
      <CodeMirror
        value={value}
        height="100%"
        theme="dark"
        extensions={extensions}
        editable={!disabled}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: true,
          bracketMatching: true,
        }}
        onChange={onChange}
        aria-label="SQL editor"
      />
    </div>
  );
}
