import {
  BINARY_OPERATIONS,
  type GraphEdgeSpec,
  type GraphNodeSpec,
  type OperationNodeSpec,
  OPERATION_LABELS,
  type SupportedOperation,
  UNARY_OPERATIONS,
} from "@/lib/graph-types";
import { Value } from "@/lib/value";

export type EvaluationMode = "forward" | "backward";

export type NodeComputation = {
  value: number;
  grad: number;
  op: string;
};

export type EvaluationResult =
  | {
      ok: true;
      activeOutputId: string;
      nodeResults: Record<string, NodeComputation>;
      warnings: string[];
    }
  | {
      ok: false;
      errors: string[];
    };

const HANDLE_ORDER: Record<string, number> = {
  in: 0,
  a: 0,
  b: 1,
};

function formatOp(op: SupportedOperation, parameter?: number): string {
  if (op === "pow") {
    return `${OPERATION_LABELS[op]}(${parameter ?? 2})`;
  }

  return OPERATION_LABELS[op];
}

function sortIncomingEdges(edges: GraphEdgeSpec[]): GraphEdgeSpec[] {
  return [...edges].sort((left, right) => {
    const leftOrder = HANDLE_ORDER[left.targetHandle ?? ""] ?? 99;
    const rightOrder = HANDLE_ORDER[right.targetHandle ?? ""] ?? 99;

    if (leftOrder === rightOrder) {
      return left.id.localeCompare(right.id);
    }

    return leftOrder - rightOrder;
  });
}

function applyOperation(node: OperationNodeSpec, inputs: Value[]): Value {
  switch (node.op) {
    case "max":
      return inputs[0].max(inputs[1]);
    case "add":
      return inputs[0].add(inputs[1]);
    case "mul":
      return inputs[0].mul(inputs[1]);
    case "sub":
      return inputs[0].sub(inputs[1]);
    case "div":
      return inputs[0].div(inputs[1]);
    case "pow":
      return inputs[0].pow(node.parameter ?? 2);
    case "neg":
      return inputs[0].neg();
    case "relu":
      return inputs[0].relu();
    case "tanh":
      return inputs[0].tanh();
    case "exp":
      return inputs[0].exp();
    case "log":
      return inputs[0].log();
    case "sigmoid":
      return inputs[0].sigmoid();
    default: {
      const exhaustiveCheck: never = node.op;
      throw new Error(`Unsupported operation: ${String(exhaustiveCheck)}`);
    }
  }
}

export function evaluateGraph(
  nodes: GraphNodeSpec[],
  edges: GraphEdgeSpec[],
  mode: EvaluationMode,
  requestedOutputId?: string,
): EvaluationResult {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const incomingByNode = new Map<string, GraphEdgeSpec[]>();

  edges.forEach((edge) => {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      return;
    }

    const existing = incomingByNode.get(edge.target) ?? [];
    existing.push(edge);
    incomingByNode.set(edge.target, existing);
  });

  const outputNodes = nodes.filter((node) => node.kind === "output");

  if (outputNodes.length === 0) {
    return {
      ok: false,
      errors: ["Add an output node to choose where backprop starts."],
    };
  }

  const activeOutput =
    outputNodes.find((node) => node.id === requestedOutputId) ?? outputNodes[0];

  const builtValues = new Map<string, Value>();
  const nodeBindings = new Map<string, Value>();
  const visiting = new Set<string>();

  const buildNode = (nodeId: string): Value => {
    const cached = builtValues.get(nodeId);
    if (cached) {
      return cached;
    }

    if (visiting.has(nodeId)) {
      throw new Error("Cycle detected. Backprop graphs must be acyclic.");
    }

    const node = nodeMap.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} was not found.`);
    }

    visiting.add(nodeId);

    const finish = (value: Value) => {
      builtValues.set(nodeId, value);
      nodeBindings.set(nodeId, value);
      visiting.delete(nodeId);
      return value;
    };

    if (node.kind === "input") {
      const incoming = incomingByNode.get(nodeId) ?? [];
      if (incoming.length > 0) {
        throw new Error(`Input node “${node.label}” cannot receive incoming edges.`);
      }

      return finish(new Value(node.value, [], "input", node.label));
    }

    if (node.kind === "output") {
      const incoming = sortIncomingEdges(incomingByNode.get(nodeId) ?? []);
      if (incoming.length !== 1) {
        throw new Error(`Output node “${node.label}” must have exactly one input.`);
      }

      const upstream = buildNode(incoming[0].source);
      nodeBindings.set(nodeId, upstream);
      visiting.delete(nodeId);
      return upstream;
    }

    const incoming = sortIncomingEdges(incomingByNode.get(nodeId) ?? []);
    const expectedArity = UNARY_OPERATIONS.includes(node.op)
      ? 1
      : BINARY_OPERATIONS.includes(node.op)
        ? 2
        : 0;

    if (expectedArity === 2) {
      const handles = new Set(incoming.map((edge) => edge.targetHandle ?? ""));
      if (!handles.has("a") || !handles.has("b")) {
        throw new Error(`Binary op “${node.label}” needs one connection on both a and b.`);
      }
    }

    if (incoming.length !== expectedArity) {
      throw new Error(
        `Operation node “${node.label}” expects ${expectedArity} input${expectedArity === 1 ? "" : "s"}.`,
      );
    }

    const inputs = incoming.map((edge) => buildNode(edge.source));
    const result = applyOperation(node, inputs);
    result.label = node.label;
    return finish(result);
  };

  try {
    const root = buildNode(activeOutput.id);

    if (mode === "backward") {
      root.backward();
    } else {
      root.zeroGrad();
    }

    const nodeResults: Record<string, NodeComputation> = {};

    nodeBindings.forEach((value, nodeId) => {
      const node = nodeMap.get(nodeId);
      nodeResults[nodeId] = {
        value: value.data,
        grad: value.grad,
        op:
          node?.kind === "operation"
            ? formatOp(node.op, node.parameter)
            : node?.kind === "output"
              ? "output"
              : "input",
      };
    });

    const warnings = nodes
      .filter((node) => !nodeBindings.has(node.id))
      .map((node) => `Node “${node.label}” is currently disconnected from the active output.`);

    return {
      ok: true,
      activeOutputId: activeOutput.id,
      nodeResults,
      warnings,
    };
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : "Graph evaluation failed."],
    };
  }
}
