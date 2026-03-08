"use client";

import "@xyflow/react/dist/style.css";

import {
  addEdge,
  Background,
  BaseEdge,
  Controls,
  Handle,
  MiniMap,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesData,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import "katex/dist/katex.min.css";
import { InlineMath } from "react-katex";

import { PRACTICE_EXAMPLES } from "@/lib/examples";
import { evaluateGraph, type EvaluationMode } from "@/lib/graph-evaluator";
import {
  getOperationArity,
  OPERATION_LABELS,
  type GraphEdgeSpec,
  type GraphNodeKind,
  type GraphNodeSpec,
  type PracticeExample,
  type SupportedOperation,
} from "@/lib/graph-types";

/* ─── Types ─── */

type EditorNodeData = {
  kind: GraphNodeKind;
  label: string;
  value?: number;
  op?: SupportedOperation;
  parameter?: number;
  resultValue: number | null;
  grad: number | null;
};

type LabeledEdgeData = {
  forwardValue: number | null;
  gradValue: number | null;
};

type EditorNode = Node<EditorNodeData>;
type EditorEdge = Edge<LabeledEdgeData>;
type InputEditorNode = Node<EditorNodeData, "inputNode">;
type OperationEditorNode = Node<EditorNodeData, "operationNode">;
type OutputEditorNode = Node<EditorNodeData, "outputNode">;

type EditorContextValue = {
  updateLabel: (nodeId: string, label: string) => void;
  updateValue: (nodeId: string, value: number) => void;
  updateOperation: (nodeId: string, op: SupportedOperation) => void;
  updateParameter: (nodeId: string, parameter: number) => void;
};

type StatusTone = "info" | "success" | "error";

type StatusState = {
  tone: StatusTone;
  text: string;
};

const DEFAULT_OPERATION: SupportedOperation = "add";

const DEFAULT_STATUS: StatusState = {
  tone: "info",
  text: "Load an example, tweak values, connect nodes, then run forward or backward.",
};

const EDGE_BASE_STYLE = { stroke: "#94a3b8", strokeWidth: 1.5 };

const GraphEditorContext = createContext<EditorContextValue | null>(null);

function useGraphEditor(): EditorContextValue {
  const value = useContext(GraphEditorContext);

  if (!value) {
    throw new Error("Graph editor context is missing.");
  }

  return value;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "";
  }

  if (!Number.isFinite(value)) {
    return value > 0 ? "+∞" : "−∞";
  }

  return value.toFixed(2);
}

function resetNodeMetrics(node: EditorNode): EditorNode {
  return {
    ...node,
    data: {
      ...node.data,
      resultValue: null,
      grad: null,
    },
  };
}

function decorateEdge(edge: EditorEdge, active = true): EditorEdge {
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

function makeNodeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function getDefaultPosition(index: number) {
  return {
    x: 40 + (index % 3) * 160,
    y: 40 + Math.floor(index / 3) * 100,
  };
}

function toEditorNode(spec: GraphNodeSpec): EditorNode {
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

function toEditorEdge(spec: GraphEdgeSpec): EditorEdge {
  return decorateEdge({
    id: spec.id,
    source: spec.source,
    target: spec.target,
    targetHandle: spec.targetHandle ?? undefined,
    data: { forwardValue: null, gradValue: null },
  });
}

function serializeNodes(nodes: EditorNode[]): GraphNodeSpec[] {
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

function serializeEdges(edges: EditorEdge[]): GraphEdgeSpec[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    targetHandle: edge.targetHandle ?? null,
  }));
}

/* ─── Custom Edge with Labels ─── */

function LabeledEdge({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  targetPosition,
  data,
  style,
}: EdgeProps<Edge<LabeledEdgeData>>) {
  const sourceNodeData = useNodesData<EditorNode>(source);

  const midX = (sourceX + targetX) / 2;
  const isStraight = Math.abs(sourceY - targetY) < 1;
  const edgePath = isStraight 
    ? `M ${sourceX},${sourceY} L ${targetX},${targetY}` 
    : `M ${sourceX},${sourceY} L ${midX},${sourceY} L ${targetX},${targetY}`;
  const labelX = isStraight ? (sourceX + targetX) / 2 : (sourceX + midX) / 2;
  const labelY = sourceY;

  let forwardVal = data?.forwardValue;
  if (forwardVal === null || forwardVal === undefined) {
    if (sourceNodeData?.data?.kind === "input") {
      forwardVal = sourceNodeData.data.value;
    }
  }

  const forwardText = formatNumber(forwardVal);
  const gradText = formatNumber(data?.gradValue);
  const hasLabels = forwardText || gradText;

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} />
      {hasLabels && (
        <>
          {forwardText && (
            <text
              x={labelX}
              y={labelY - 8}
              textAnchor="middle"
              dominantBaseline="auto"
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                fill: "#22c55e",
                fontWeight: 500,
                pointerEvents: "none",
              }}
            >
              {forwardText}
            </text>
          )}
          {gradText && (
            <text
              x={labelX}
              y={labelY + 16}
              textAnchor="middle"
              dominantBaseline="auto"
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                fill: "#ef4444",
                fontWeight: 500,
                pointerEvents: "none",
              }}
            >
              {gradText}
            </text>
          )}
        </>
      )}
    </>
  );
}

const edgeTypes: EdgeTypes = {
  labeledEdge: LabeledEdge,
};

/* ─── Status Banner ─── */

function ToneBanner({ status }: { status: StatusState }) {
  const toneClasses: Record<StatusTone, string> = {
    info: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    error: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${toneClasses[status.tone]}`}>
      {status.text}
    </div>
  );
}

/* ─── Compact Node Components ─── */

const CIRCLE_SIZE = 44;

const circleStyle: React.CSSProperties = {
  width: CIRCLE_SIZE,
  height: CIRCLE_SIZE,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 14,
  fontWeight: 600,
  cursor: "grab",
  border: "2px solid #64748b",
  background: "#1e293b",
  color: "#e2e8f0",
  position: "relative",
};

const handleStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  backgroundColor: "#94a3b8",
  border: "1.5px solid #0f172a",
};

const InputNode = memo(function InputNode({ data }: NodeProps<InputEditorNode>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Empty space for alignment */}
      <div style={{ height: 18 }} />
      {/* Circle */}
      <div style={{ ...circleStyle, borderColor: "#22c55e", background: "#052e16" }}>
        {/* Label left */}
        <div
          style={{
            position: "absolute",
            right: "100%",
            marginRight: 10,
            fontSize: 12,
            fontWeight: 500,
            color: "#e2e8f0",
            whiteSpace: "nowrap",
          }}
        >
          <InlineMath math={data.label.replace(/(\d+)$/, "_{$1}")} />
        </div>
        <span style={{ fontSize: 11 }}>●</span>
        <Handle
          type="source"
          position={Position.Right}
          style={handleStyle}
        />
      </div>
    </div>
  );
});

const OperationNode = memo(function OperationNode({ data }: NodeProps<OperationEditorNode>) {
  const op = data.op ?? DEFAULT_OPERATION;
  const arity = getOperationArity(op);
  const symbol = OPERATION_LABELS[op];

  let mathStr = "";
  if (op === "pow") {
    mathStr = `x^{${data.parameter ?? 2}}`;
  } else {
    mathStr = {
      add: "+",
      mul: "\\times",
      sub: "-",
      div: "\\div",
      neg: "-",
      relu: "\\text{ReLU}",
      tanh: "\\tanh",
      exp: "\\exp",
      sigmoid: "\\sigma",
    }[op] || symbol;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ height: 18 }} />
      <div style={{ ...circleStyle }}>
        <span><InlineMath math={mathStr} /></span>
      {arity === 1 ? (
        <Handle
          type="target"
          id="a"
          position={Position.Left}
          style={{ ...handleStyle, top: "50%" }}
        />
      ) : (
        <>
          <Handle
            type="target"
            id="a"
            position={Position.Left}
            style={{ ...handleStyle, top: "30%" }}
          />
          <Handle
            type="target"
            id="b"
            position={Position.Left}
            style={{ ...handleStyle, top: "70%" }}
          />
        </>
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={handleStyle}
      />
      </div>
    </div>
  );
});

const OutputNode = memo(function OutputNode({ data }: NodeProps<OutputEditorNode>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Empty space for alignment */}
      <div style={{ height: 22 }} />
      <div style={{ ...circleStyle, borderColor: "#f59e0b", background: "#422006", width: 36, height: 36 }}>
        <span style={{ fontSize: 9 }}>●</span>
        <Handle
          type="target"
          id="in"
          position={Position.Left}
          style={handleStyle}
        />
      </div>
    </div>
  );
});

const nodeTypes: NodeTypes = {
  inputNode: InputNode,
  operationNode: OperationNode,
  outputNode: OutputNode,
};

/* ─── Graph Canvas ─── */

function PracticeCanvas() {
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<EditorNode>(
    PRACTICE_EXAMPLES[0].nodes.map(toEditorNode),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<EditorEdge>(
    PRACTICE_EXAMPLES[0].edges.map(toEditorEdge),
  );
  const [selectedExampleId, setSelectedExampleId] = useState(PRACTICE_EXAMPLES[0].id);
  const [status, setStatus] = useState<StatusState>({
    tone: "info",
    text: PRACTICE_EXAMPLES[0].description,
  });

  const resetComputedState = useCallback(
    (nextStatus = DEFAULT_STATUS) => {
      setNodes((current) => current.map(resetNodeMetrics));
      setEdges((current) =>
        current.map((edge) =>
          decorateEdge({
            ...edge,
            data: { forwardValue: null, gradValue: null },
          }),
        ),
      );
      setStatus(nextStatus);
    },
    [setEdges, setNodes],
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const clearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setStatus({ tone: "info", text: "Canvas cleared. Add nodes or load an example to start." });
  }, [setEdges, setNodes]);

  const updateLabel = useCallback(
    (nodeId: string, label: string) => {
      setNodes((current) =>
        current.map((node) => {
          const nextNode = resetNodeMetrics(node);
          if (node.id !== nodeId) {
            return nextNode;
          }

          return {
            ...nextNode,
            data: {
              ...nextNode.data,
              label,
            },
          };
        }),
      );
      setStatus(DEFAULT_STATUS);
    },
    [setNodes],
  );

  const updateValue = useCallback(
    (nodeId: string, value: number) => {
      setNodes((current) =>
        current.map((node) => {
          const nextNode = resetNodeMetrics(node);
          if (node.id !== nodeId) {
            return nextNode;
          }

          return {
            ...nextNode,
            data: {
              ...nextNode.data,
              value,
            },
          };
        }),
      );
      setStatus(DEFAULT_STATUS);
    },
    [setNodes],
  );

  const updateParameter = useCallback(
    (nodeId: string, parameter: number) => {
      setNodes((current) =>
        current.map((node) => {
          const nextNode = resetNodeMetrics(node);
          if (node.id !== nodeId) {
            return nextNode;
          }

          return {
            ...nextNode,
            data: {
              ...nextNode.data,
              parameter,
            },
          };
        }),
      );
      setStatus(DEFAULT_STATUS);
    },
    [setNodes],
  );

  const updateOperation = useCallback(
    (nodeId: string, op: SupportedOperation) => {
      setNodes((current) =>
        current.map((node) => {
          const nextNode = resetNodeMetrics(node);
          if (node.id !== nodeId) {
            return nextNode;
          }

          return {
            ...nextNode,
            data: {
              ...nextNode.data,
              op,
              parameter: op === "pow" ? nextNode.data.parameter ?? 2 : undefined,
            },
          };
        }),
      );

      if (getOperationArity(op) === 1) {
        setEdges((current) =>
          current
            .filter((edge) => !(edge.target === nodeId && edge.targetHandle === "b"))
            .map((edge) => decorateEdge(edge)),
        );
      }

      setStatus(DEFAULT_STATUS);
    },
    [setEdges, setNodes],
  );

  const editorContextValue = useMemo<EditorContextValue>(
    () => ({
      updateLabel,
      updateValue,
      updateOperation,
      updateParameter,
    }),
    [updateLabel, updateOperation, updateParameter, updateValue],
  );

  const loadExample = useCallback(
    (example: PracticeExample) => {
      setSelectedExampleId(example.id);
      setNodes(example.nodes.map(toEditorNode));
      setEdges(example.edges.map(toEditorEdge));
      setStatus({ tone: "info", text: example.description });
      window.requestAnimationFrame(() => {
        void fitView({ duration: 250, padding: 0.2 });
      });
    },
    [fitView, setEdges, setNodes],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<EditorNode>[]) => {
      onNodesChange(changes);

      if (changes.some((change) => change.type === "remove")) {
        setStatus(DEFAULT_STATUS);
      }
    },
    [onNodesChange],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<EditorEdge>[]) => {
      onEdgesChange(changes);

      if (changes.some((change) => change.type === "remove")) {
        resetComputedState();
      }
    },
    [onEdgesChange, resetComputedState],
  );

  const hasOutputNode = nodes.some((node) => node.data.kind === "output");

  const addNode = useCallback(
    (kind: GraphNodeKind) => {
      if (kind === "output" && hasOutputNode) {
        setStatus({
          tone: "error",
          text: "Keep one output node for the current MVP. Reuse or relabel the existing output.",
        });
        return;
      }

      setNodes((current) => {
        const base = current.map(resetNodeMetrics);
        const id = makeNodeId(kind === "input" ? "x" : kind === "operation" ? "op" : "out");
        const position = getDefaultPosition(base.length);

        const newNode: EditorNode =
          kind === "input"
            ? {
                id,
                type: "inputNode",
                position,
                data: {
                  kind,
                  label: `x${base.length + 1}`,
                  value: 0,
                  resultValue: null,
                  grad: null,
                },
              }
            : kind === "operation"
              ? {
                  id,
                  type: "operationNode",
                  position,
                  data: {
                    kind,
                    label: `op${base.length + 1}`,
                    op: DEFAULT_OPERATION,
                    resultValue: null,
                    grad: null,
                  },
                }
              : {
                  id,
                  type: "outputNode",
                  position,
                  data: {
                    kind,
                    label: "output",
                    resultValue: null,
                    grad: null,
                  },
                };

        return [...base, newNode];
      });

      setEdges((current) => current.map((edge) => decorateEdge(edge)));
      setStatus({
        tone: "info",
        text: `Added a new ${kind} node. Connect it into the graph to make it active.`,
      });
    },
    [hasOutputNode, setEdges, setNodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
        return;
      }

      if (connection.source === connection.target) {
        setStatus({ tone: "error", text: "Self-connections are not allowed." });
        return;
      }

      setEdges((current) => {
        const nextEdges = current.filter(
          (edge) =>
            !(edge.target === connection.target && (edge.targetHandle ?? "") === (connection.targetHandle ?? "")),
        );

        return addEdge(
          decorateEdge({
            id: makeNodeId("edge"),
            source: connection.source,
            target: connection.target,
            targetHandle: connection.targetHandle ?? undefined,
            data: { forwardValue: null, gradValue: null },
          }),
          nextEdges,
        );
      });

      setNodes((current) => current.map(resetNodeMetrics));
      setStatus({
        tone: "info",
        text: "Connection updated. Run the graph again to refresh values and gradients.",
      });
    },
    [setEdges, setNodes],
  );

  const runEvaluation = useCallback(
    (mode: EvaluationMode) => {
      const result = evaluateGraph(serializeNodes(nodes), serializeEdges(edges), mode);

      if (!result.ok) {
        setNodes((current) => current.map(resetNodeMetrics));
        setStatus({ tone: "error", text: result.errors.join(" ") });
        return;
      }

      const reachableNodeIds = new Set(Object.keys(result.nodeResults));

      setNodes((current) =>
        current.map((node) => {
          const metrics = result.nodeResults[node.id];

          if (!metrics) {
            return {
              ...node,
              data: {
                ...node.data,
                resultValue: null,
                grad: null,
              },
            };
          }

          return {
            ...node,
            data: {
              ...node.data,
              resultValue: metrics.value,
              grad: metrics.grad,
            },
          };
        }),
      );

      // Update edges with forward values and gradients from the SOURCE node
      setEdges((current) =>
        current.map((edge) => {
          const sourceResult = result.nodeResults[edge.source];
          const isActive = reachableNodeIds.has(edge.source) && reachableNodeIds.has(edge.target);
          return {
            ...decorateEdge(edge, isActive),
            data: {
              forwardValue: sourceResult?.value ?? null,
              gradValue: sourceResult?.grad ?? null,
            },
          };
        }),
      );

      const outputMetrics = result.nodeResults[result.activeOutputId];
      const warningsText = result.warnings.length > 0 ? ` ${result.warnings.join(" ")}` : "";

      setStatus({
        tone: "success",
        text:
          mode === "forward"
            ? `Forward pass complete. Output = ${formatNumber(outputMetrics?.value)}.${warningsText}`
            : `Backward pass complete. Output = ${formatNumber(outputMetrics?.value)}, dOutput/dOutput = ${formatNumber(outputMetrics?.grad)}.${warningsText}`,
      });
    },
    [edges, nodes, setEdges, setNodes],
  );

  /* ── Selected-node editing panel ── */
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: EditorNode) => {
      setSelectedNodeId(node.id);
    },
    [],
  );

  const editor = editorContextValue;

  return (
    <GraphEditorContext.Provider value={editorContextValue}>
      <div className="flex h-screen flex-col bg-slate-950 text-slate-100 lg:flex-row">
        <aside className="w-full shrink-0 border-b border-slate-800 bg-slate-950/90 p-6 lg:h-screen lg:w-80 lg:border-b-0 lg:border-r lg:overflow-y-auto">
          <div className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-violet-300">
              GraphGrad
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Computation Graph Visualizer
            </h1>
          </div>

          <div className="space-y-4">
            <ToneBanner status={status} />

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <h2 className="mb-3 text-sm font-semibold text-white">Examples</h2>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-400"
                value={selectedExampleId}
                onChange={(event) => {
                  const next = PRACTICE_EXAMPLES.find((example) => example.id === event.target.value);
                  if (next) {
                    loadExample(next);
                  }
                }}
              >
                {PRACTICE_EXAMPLES.map((example) => (
                  <option key={example.id} value={example.id}>
                    {example.title}
                  </option>
                ))}
              </select>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <h2 className="mb-3 text-sm font-semibold text-white">Build</h2>
              <div className="grid grid-cols-3 gap-2">
                <button
                  className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-400"
                  onClick={() => addNode("input")}
                >
                  + Input
                </button>
                <button
                  className="rounded-xl bg-violet-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-400"
                  onClick={() => addNode("operation")}
                >
                  + Op
                </button>
                <button
                  className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-700"
                  onClick={() => addNode("output")}
                  disabled={hasOutputNode}
                >
                  + Out
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <h2 className="mb-3 text-sm font-semibold text-white">Run</h2>
              <div className="grid grid-cols-3 gap-2">
                <button
                  className="rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-400"
                  onClick={() => runEvaluation("forward")}
                >
                  Forward
                </button>
                <button
                  className="rounded-xl bg-fuchsia-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-fuchsia-400"
                  onClick={() => runEvaluation("backward")}
                >
                  Backprop
                </button>
                <button
                  className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-600"
                  onClick={() => resetComputedState()}
                >
                  Clear
                </button>
              </div>
              <button
                className="mt-2 w-full rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-400 transition hover:bg-rose-500/20"
                onClick={clearCanvas}
              >
                Clear Canvas
              </button>
            </section>

            {/* Selected node editor */}
            {selectedNode && (
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                    Edit: <InlineMath math={selectedNode.data.label.replace(/(\d+)$/, "_{$1}")} />
                  </h2>
                  <button
                    className="text-xs text-slate-400 hover:text-white"
                    onClick={() => setSelectedNodeId(null)}
                  >
                    ✕
                  </button>
                </div>

                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
                  Label
                </label>
                <input
                  className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-400"
                  value={selectedNode.data.label}
                  onChange={(e) => editor.updateLabel(selectedNode.id, e.target.value)}
                />

                {selectedNode.data.kind === "input" && (
                  <>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
                      Value
                    </label>
                    <input
                      className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-400"
                      type="number"
                      step="any"
                      value={selectedNode.data.value ?? 0}
                      onChange={(e) => editor.updateValue(selectedNode.id, Number(e.target.value))}
                    />
                  </>
                )}

                {selectedNode.data.kind === "operation" && (
                  <>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
                      Operation
                    </label>
                    <select
                      className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-400"
                      value={selectedNode.data.op ?? DEFAULT_OPERATION}
                      onChange={(e) =>
                        editor.updateOperation(selectedNode.id, e.target.value as SupportedOperation)
                      }
                    >
                      {Object.entries(OPERATION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {value} · {label}
                        </option>
                      ))}
                    </select>

                    {selectedNode.data.op === "pow" && (
                      <>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
                          Exponent
                        </label>
                        <input
                          className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-400"
                          type="number"
                          step="any"
                          value={selectedNode.data.parameter ?? 2}
                          onChange={(e) =>
                            editor.updateParameter(selectedNode.id, Number(e.target.value))
                          }
                        />
                      </>
                    )}
                  </>
                )}

                {/* Computed values */}
                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between rounded bg-slate-800 px-2 py-1">
                    <span className="text-slate-400">Data</span>
                    <span className="font-mono text-emerald-400">
                      {formatNumber(selectedNode.data.resultValue) || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between rounded bg-slate-800 px-2 py-1">
                    <span className="text-slate-400">Grad</span>
                    <span className="font-mono text-red-400">
                      {formatNumber(selectedNode.data.grad) || "—"}
                    </span>
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
              <h2 className="mb-2 text-sm font-semibold text-white">Legend</h2>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-4 rounded" style={{ background: "#22c55e" }} />
                  <span>Forward value (above edge)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-4 rounded" style={{ background: "#ef4444" }} />
                  <span>Gradient (below edge)</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Click a node to edit its properties in this panel.
              </p>
            </section>
          </div>
        </aside>

        <main className="relative flex-1 bg-slate-900">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            deleteKeyCode={["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            colorMode="dark"
          >
            <MiniMap
              pannable
              zoomable
              nodeStrokeWidth={2}
              style={{ backgroundColor: "#0f172a" }}
              maskColor="rgba(15, 23, 42, 0.7)"
            />
            <Controls />
            <Background gap={20} size={1} color="rgba(148, 163, 184, 0.08)" />
          </ReactFlow>
        </main>
      </div>
    </GraphEditorContext.Provider>
  );
}

export default function GraphPractice() {
  return (
    <ReactFlowProvider>
      <PracticeCanvas />
    </ReactFlowProvider>
  );
}
