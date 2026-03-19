import type { GraphEdgeSpec, GraphNodeSpec, SupportedOperation } from "@/lib/graph-types";
import { OPERATION_LABELS } from "@/lib/graph-types";

import {
  DEFAULT_OPERATION,
  EDGE_BASE_STYLE,
  MOBILE_BREAKPOINT_PX,
  OPERATION_MATH_LABELS,
  SIDEBAR_COLLAPSED_RESERVED_WIDTH_PX,
  SIDEBAR_RESERVED_WIDTH_PX,
} from "./constants";
import type { EditorEdge, EditorNode } from "./types";

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "";
  }

  if (!Number.isFinite(value)) {
    return value > 0 ? "\\infty" : "−\\infty";
  }

  return value.toFixed(2);
}

export function getOperationMathLabel(op: SupportedOperation, parameter?: number): string {
  if (op === "pow") {
    return `x^{${parameter ?? 2}}`;
  }

  return OPERATION_MATH_LABELS[op] ?? OPERATION_LABELS[op];
}

export function normalizeMathSubscripts(text: string): string {
  return text
    .replace(/_(\-?\d+)\b/g, "_{$1}")
    .replace(/_\{\s*(\-?\d+)\s*\}/g, "_{$1}")
    .replace(/\b([a-z]+)(\d+)\b(?!\s*\()/g, "$1_{$2}");
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function resetNodeMetrics(node: EditorNode): EditorNode {
  return {
    ...node,
    data: {
      ...node.data,
      resultValue: null,
      grad: null,
    },
  };
}

export function decorateEdge(edge: EditorEdge, active = true): EditorEdge {
  return {
    ...edge,
    type: "labeledEdge",
    animated: false,
    style: {
      ...EDGE_BASE_STYLE,
      stroke: active ? "#94a3b8" : "#475569",
    },
    data: edge.data ?? { forwardValue: null, gradValue: null },
  };
}

export function makeNodeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function getSidebarReservedWidth(windowWidth: number, isSidebarOpen: boolean): number {
  if (!isSidebarOpen) {
    return SIDEBAR_COLLAPSED_RESERVED_WIDTH_PX;
  }

  if (windowWidth < MOBILE_BREAKPOINT_PX) {
    return SIDEBAR_COLLAPSED_RESERVED_WIDTH_PX;
  }

  return SIDEBAR_RESERVED_WIDTH_PX;
}

function getInputLabelSubscript(label: string): number | null {
  const match = label
    .trim()
    .match(/(?:_(?:\{\s*(-?\d+)\s*\}|(-?\d+))|([A-Za-z]+)(-?\d+))$/);
  const rawValue = match?.[1] ?? match?.[2] ?? match?.[4];

  if (!rawValue) {
    return null;
  }

  const subscript = Number.parseInt(rawValue, 10);
  return Number.isNaN(subscript) ? null : subscript;
}

export function getNextInputLabel(nodes: EditorNode[]): string {
  const usedSubscripts = new Set<number>();

  nodes.forEach((node) => {
    if (node.data.kind !== "input") {
      return;
    }

    const subscript = getInputLabelSubscript(node.data.label);
    if (subscript !== null && subscript > 0) {
      usedSubscripts.add(subscript);
    }
  });

  let nextSubscript = 1;
  while (usedSubscripts.has(nextSubscript)) {
    nextSubscript += 1;
  }

  return `x_{${nextSubscript}}`;
}

export function getDefaultPosition(index: number) {
  return {
    x: 40 + (index % 3) * 160,
    y: 40 + Math.floor(index / 3) * 100,
  };
}

export function toEditorNode(spec: GraphNodeSpec): EditorNode {
  return {
    id: spec.id,
    type:
      spec.kind === "input"
        ? "inputNode"
        : spec.kind === "operation"
          ? "operationNode"
          : "outputNode",
    position: spec.position,
    data:
      spec.kind === "input"
        ? {
            kind: spec.kind,
            label: spec.label,
            value: spec.value,
            resultValue: null,
            grad: null,
          }
        : spec.kind === "operation"
          ? {
              kind: spec.kind,
              label: spec.label,
              op: spec.op,
              parameter: spec.parameter,
              resultValue: null,
              grad: null,
            }
          : {
              kind: spec.kind,
              label: spec.label,
              resultValue: null,
              grad: null,
            },
  };
}

export function toEditorEdge(spec: GraphEdgeSpec): EditorEdge {
  return decorateEdge({
    id: spec.id,
    source: spec.source,
    target: spec.target,
    targetHandle: spec.targetHandle ?? undefined,
    data: { forwardValue: null, gradValue: null },
  });
}

export function serializeNodes(nodes: EditorNode[]): GraphNodeSpec[] {
  return nodes.map((node) => {
    if (node.data.kind === "input") {
      return {
        id: node.id,
        kind: "input",
        label: node.data.label,
        value: Number(node.data.value ?? 0),
        position: node.position,
      };
    }

    if (node.data.kind === "operation") {
      return {
        id: node.id,
        kind: "operation",
        label: node.data.label,
        op: node.data.op ?? DEFAULT_OPERATION,
        parameter: node.data.parameter,
        position: node.position,
      };
    }

    return {
      id: node.id,
      kind: "output",
      label: node.data.label,
      position: node.position,
    };
  });
}

export function serializeEdges(edges: EditorEdge[]): GraphEdgeSpec[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    targetHandle: edge.targetHandle ?? null,
  }));
}
