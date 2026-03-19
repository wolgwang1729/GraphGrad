import { createContext, useContext } from "react";

import type { EditorContextValue } from "./types";

export const GraphEditorContext = createContext<EditorContextValue | null>(null);

export function useGraphEditor(): EditorContextValue {
  const value = useContext(GraphEditorContext);

  if (!value) {
    throw new Error("Graph editor context is missing.");
  }

  return value;
}
