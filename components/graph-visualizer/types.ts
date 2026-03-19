import type { Edge, Node } from "@xyflow/react";

import type {
  GraphNodeKind,
  GraphEdgeSpec,
  GraphNodeSpec,
  SupportedOperation,
} from "@/lib/graph-types";

export type EditorNodeData = {
  kind: GraphNodeKind;
  label: string;
  value?: number;
  op?: SupportedOperation;
  parameter?: number;
  resultValue: number | null;
  grad: number | null;
};

export type LabeledEdgeData = {
  forwardValue: number | null;
  gradValue: number | null;
};

export type EditorNode = Node<EditorNodeData>;
export type EditorEdge = Edge<LabeledEdgeData>;
export type InputEditorNode = Node<EditorNodeData, "inputNode">;
export type OperationEditorNode = Node<EditorNodeData, "operationNode">;
export type OutputEditorNode = Node<EditorNodeData, "outputNode">;

export type EditorContextValue = {
  isDarkMode: boolean;
  isLocked: boolean;
  updateLabel: (nodeId: string, label: string) => void;
  updateValue: (nodeId: string, value: number) => void;
  updateOperation: (nodeId: string, op: SupportedOperation) => void;
  updateParameter: (nodeId: string, parameter: number) => void;
  deleteNode: (nodeId: string) => void;
  deleteEdge: (edgeId: string) => void;
  showError: (message: string) => void;
};

export type StatusTone = "info" | "success" | "error";

export type StatusState = {
  tone: StatusTone;
  text: string;
};

export type { GraphEdgeSpec, GraphNodeSpec };
