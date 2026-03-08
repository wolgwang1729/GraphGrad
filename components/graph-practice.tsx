"use client";

import "@xyflow/react/dist/style.css";

import {
  addEdge,
  Background,
  BaseEdge,
  ControlButton,
  Controls,
  Handle,
  NodeToolbar,
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
  getViewportForBounds,
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
  useRef,
  useEffect,
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
const FIT_VIEW_PADDING = 0.2;
const SIDEBAR_RESERVED_WIDTH_PX = 430;
const SIDEBAR_COLLAPSED_RESERVED_WIDTH_PX = 0;

const TOOLBAR_THRESHOLD_PX = 150;

/**
 * Measures available space above the node in the viewport using actual DOM rects.
 * Returns Position.Bottom when the node is near the top edge, Position.Top otherwise.
 */
function useToolbarPosition(nodeRef: React.RefObject<HTMLDivElement | null>): Position {
  const [pos, setPos] = useState<Position>(Position.Top);

  useEffect(() => {
    const el = nodeRef.current;
    if (!el) return;

    function measure() {
      const el = nodeRef.current;
      if (!el) return;
      // Walk up to the .react-flow wrapper to get the canvas bounding box
      const rfContainer = el.closest(".react-flow") as HTMLElement | null;
      if (!rfContainer) return;
      const containerRect = rfContainer.getBoundingClientRect();
      const nodeRect = el.getBoundingClientRect();
      const spaceAbove = nodeRect.top - containerRect.top;
      setPos(spaceAbove < TOOLBAR_THRESHOLD_PX ? Position.Bottom : Position.Top);
    }

    measure();
    // Re-measure on scroll/wheel (panning) and on any transform change
    const rfContainer = el.closest(".react-flow") as HTMLElement | null;
    if (!rfContainer) return;

    const observer = new MutationObserver(measure);
    // The .react-flow__viewport element gets transform style changes on pan/zoom
    const viewport = rfContainer.querySelector(".react-flow__viewport");
    if (viewport) {
      observer.observe(viewport, { attributes: true, attributeFilter: ["style"] });
    }

    rfContainer.addEventListener("wheel", measure, { passive: true });
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      rfContainer.removeEventListener("wheel", measure);
      window.removeEventListener("resize", measure);
    };
  }, [nodeRef]);

  return pos;
}

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

function renderTextWithMath(text: string) {
  if (!text.includes("$")) return text;
  const parts = text.split("$");
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return (
        <span key={index}>
          <InlineMath math={part} />
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function ToneBanner({ status }: { status: StatusState }) {
  const toneClasses: Record<StatusTone, string> = {
    info: "border-sky-500/30 bg-sky-500/10 text-slate-300",
    success: "border-emerald-500/30 bg-emerald-500/10 text-slate-300",
    error: "border-rose-500/30 bg-rose-500/10 text-slate-300",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${toneClasses[status.tone]}`}>
      {renderTextWithMath(status.text)}
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

const InputNode = memo(function InputNode({ id, data, selected }: NodeProps<InputEditorNode>) {
  const editor = useGraphEditor();
  const nodeRef = useRef<HTMLDivElement>(null);
  const toolbarPos = useToolbarPosition(nodeRef);

  return (
    <div ref={nodeRef} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <NodeToolbar isVisible={selected} position={toolbarPos} className="flex w-40 flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-xl">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase text-slate-400">Label</label>
          <input className="nodrag w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-indigo-500" value={data.label} onChange={(e) => editor.updateLabel(id, e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase text-slate-400">Value</label>
          <input type="number" step="any" className="nodrag w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-indigo-500" value={data.value ?? 0} onChange={(e) => editor.updateValue(id, Number(e.target.value))} />
        </div>
        <div className="mt-1 space-y-1 text-xs">
          <div className="flex justify-between gap-4 rounded bg-slate-800 px-2 py-1">
            <span className="text-slate-400">Data</span>
            <span className="font-mono text-emerald-400">{formatNumber(data.resultValue) || "—"}</span>
          </div>
          <div className="flex justify-between gap-4 rounded bg-slate-800 px-2 py-1">
            <span className="text-slate-400">Grad</span>
            <span className="font-mono text-rose-400">{formatNumber(data.grad) || "—"}</span>
          </div>
        </div>
      </NodeToolbar>
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
          <InlineMath math={data.label} />
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

const OperationNode = memo(function OperationNode({ id, data, selected }: NodeProps<OperationEditorNode>) {
  const editor = useGraphEditor();
  const nodeRef = useRef<HTMLDivElement>(null);
  const toolbarPos = useToolbarPosition(nodeRef);
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
      max: "\\max",
    }[op] || symbol;
  }

  return (
    <div ref={nodeRef} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <NodeToolbar isVisible={selected} position={toolbarPos} className="flex w-40 flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-xl">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase text-slate-400">Label</label>
          <input className="nodrag w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-indigo-500" value={data.label} onChange={(e) => editor.updateLabel(id, e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase text-slate-400">Operation</label>
          <select className="nodrag w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-indigo-500" value={op} onChange={(e) => editor.updateOperation(id, e.target.value as SupportedOperation)}>
            {Object.entries(OPERATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{value} · {label}</option>
            ))}
          </select>
        </div>
        {op === "pow" && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase text-slate-400">Exponent</label>
            <input type="number" step="any" className="nodrag w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-indigo-500" value={data.parameter ?? 2} onChange={(e) => editor.updateParameter(id, Number(e.target.value))} />
          </div>
        )}
        <div className="mt-1 space-y-1 text-xs">
          <div className="flex justify-between gap-4 rounded bg-slate-800 px-2 py-1">
            <span className="text-slate-400">Data</span>
            <span className="font-mono text-emerald-400">{formatNumber(data.resultValue) || "—"}</span>
          </div>
          <div className="flex justify-between gap-4 rounded bg-slate-800 px-2 py-1">
            <span className="text-slate-400">Grad</span>
            <span className="font-mono text-rose-400">{formatNumber(data.grad) || "—"}</span>
          </div>
        </div>
      </NodeToolbar>
      <div style={{ height: 18 }} />
      <div style={{ ...circleStyle }}>
        {/* Label top */}
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            marginBottom: 6,
            fontSize: 12,
            fontWeight: 500,
            color: "#94a3b8",
            whiteSpace: "nowrap",
          }}
        >
          <InlineMath math={data.label} />
        </div>
        <span style={(op === "relu" || op === "tanh" || op === "exp" || op === "max") ? { fontSize: 11 } : undefined}><InlineMath math={mathStr} /></span>
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

const OutputNode = memo(function OutputNode({ id, data, selected }: NodeProps<OutputEditorNode>) {
  const editor = useGraphEditor();
  const nodeRef = useRef<HTMLDivElement>(null);
  const toolbarPos = useToolbarPosition(nodeRef);

  return (
    <div ref={nodeRef} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <NodeToolbar isVisible={selected} position={toolbarPos} className="flex w-40 flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-xl">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase text-slate-400">Label</label>
          <input className="nodrag w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-indigo-500" value={data.label} onChange={(e) => editor.updateLabel(id, e.target.value)} />
        </div>
        <div className="mt-1 space-y-1 text-xs">
          <div className="flex justify-between gap-4 rounded bg-slate-800 px-2 py-1">
            <span className="text-slate-400">Data</span>
            <span className="font-mono text-emerald-400">{formatNumber(data.resultValue) || "—"}</span>
          </div>
          <div className="flex justify-between gap-4 rounded bg-slate-800 px-2 py-1">
            <span className="text-slate-400">Grad</span>
            <span className="font-mono text-rose-400">{formatNumber(data.grad) || "—"}</span>
          </div>
        </div>
      </NodeToolbar>
      {/* Empty space for alignment */}
      <div style={{ height: 22 }} />
      <div style={{ ...circleStyle, borderColor: "#f59e0b", background: "#422006", width: 36, height: 36 }}>
        {/* Label top */}
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            marginBottom: 6,
            fontSize: 12,
            fontWeight: 500,
            color: "#94a3b8",
            whiteSpace: "nowrap",
          }}
        >
          <InlineMath math={data.label} />
        </div>
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
  const { fitView, getNodesBounds, setViewport } = useReactFlow();
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const fitViewConfig = useMemo(
    () => ({
      padding: FIT_VIEW_PADDING,
      minZoom: 0.35,
      maxZoom: 1.5,
    }),
    [],
  );

  const fitGraphToVisibleArea = useCallback(
    (duration = 300) => {
      if (typeof window === "undefined") {
        return;
      }

      const reservedWidth = isSidebarOpen
        ? SIDEBAR_RESERVED_WIDTH_PX
        : SIDEBAR_COLLAPSED_RESERVED_WIDTH_PX;

      if (nodes.length === 0) {
        void fitView({ duration, ...fitViewConfig });
        return;
      }

      const bounds = getNodesBounds(nodes);
      const visibleWidth = Math.max(window.innerWidth - reservedWidth, 320);
      const visibleHeight = Math.max(window.innerHeight - 20, 320);
      const viewport = getViewportForBounds(
        bounds,
        visibleWidth,
        visibleHeight,
        fitViewConfig.minZoom,
        fitViewConfig.maxZoom,
        fitViewConfig.padding,
      );

      void setViewport(
        {
          x: viewport.x + reservedWidth,
          y: viewport.y,
          zoom: viewport.zoom,
        },
        { duration },
      );
    },
    [fitView, fitViewConfig, getNodesBounds, isSidebarOpen, nodes, setViewport],
  );

  useEffect(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        fitGraphToVisibleArea(300);
      });
    });
  }, [fitGraphToVisibleArea, isSidebarOpen]);

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

  const clearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
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
        window.requestAnimationFrame(() => {
          fitGraphToVisibleArea(250);
        });
      });
    },
    [fitGraphToVisibleArea, setEdges, setNodes],
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
              grad: mode === "backward" ? metrics.grad : null,
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
              gradValue: mode === "backward" ? (sourceResult?.grad ?? null) : null,
            },
          };
        }),
      );

      setStatus((prev) => ({
        tone: "success",
        text: prev.text,
      }));
    },
    [edges, nodes, setEdges, setNodes],
  );

  useEffect(() => {
    console.log(
      JSON.stringify(
        {
          id: selectedExampleId,
          title: PRACTICE_EXAMPLES.find(e => e.id === selectedExampleId)?.title || "",
          description: PRACTICE_EXAMPLES.find(e => e.id === selectedExampleId)?.description || "",
          nodes: serializeNodes(nodes),
          edges: serializeEdges(edges),
        },
        null,
        2
      )
    );
  }, [nodes, edges, selectedExampleId]);

  return (
    <GraphEditorContext.Provider value={editorContextValue}>
      <div className="relative h-screen w-screen overflow-hidden bg-slate-900 text-slate-100 font-light">
        {/* Main Canvas */}
        <main className="absolute inset-0 bg-slate-900">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitViewOptions={fitViewConfig}
            deleteKeyCode={["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            colorMode="dark"
            className="h-full w-full"
          >
            <Controls position="bottom-right" showFitView={false}>
              <ControlButton onClick={() => fitGraphToVisibleArea(250)} aria-label="Fit graph to screen">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <polyline points="9 21 3 21 3 15"></polyline>
                  <line x1="21" y1="3" x2="14" y2="10"></line>
                  <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
              </ControlButton>
            </Controls>
            <Background gap={20} size={1} color="rgba(148, 163, 184, 0.08)" />
          </ReactFlow>
        </main>

        {/* NN-SVG Style Floating Sidebar */}
        <div className="absolute top-2.5 left-2.5 z-10 flex max-h-[calc(100vh-60px)] w-102.5 flex-col rounded border border-slate-700 bg-slate-800 shadow-2xl">
          {/* Card Header */}
          <div className="border-b border-slate-700 bg-slate-800 px-5 pt-4 pb-0">
            <button 
              className="float-right mt-1 text-2xl text-slate-400 transition-transform hover:text-white"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{ transform: isSidebarOpen ? "rotate(0deg)" : "rotate(-180deg)" }}
              aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </button>
            <h1 className="mb-1 text-[2.5rem] font-thin leading-none tracking-wide text-white">
              GraphGrad
            </h1>
            <p className="mb-4 text-[15px] font-light text-slate-300">
              Computation Graph Visualizer. <a href="#" onClick={(e) => { e.preventDefault(); clearCanvas(); }} className="text-indigo-400 hover:text-indigo-300">Clear Canvas</a>
            </p>

            {/* Simulated Tabs matching NN-SVG Nav Tabs */}
            <nav className="flex translate-y-px space-x-1 border-b border-slate-700">
            </nav>
          </div>

          {/* Card Body */}
          <div className={`overflow-y-auto p-5 transition-all [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-600 ${isSidebarOpen ? "block" : "hidden"}`}>
            
            <ToneBanner status={status} />
            <hr className="my-5 border-slate-700" />

            {/* Architecture / Examples */}
            <div>
              <h4 className="mb-3 text-lg font-light text-slate-200">Architecture:</h4>
              <select
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-[15px] font-light text-slate-100 outline-none focus:border-indigo-500"
                value={selectedExampleId}
                onChange={(event) => {
                  const next = PRACTICE_EXAMPLES.find((e) => e.id === event.target.value);
                  if (next) loadExample(next);
                }}
              >
                {PRACTICE_EXAMPLES.map((example) => (
                  <option key={example.id} value={example.id}>
                    {example.title}
                  </option>
                ))}
              </select>
            </div>

            <hr className="my-5 border-slate-700" />

            {/* Nodes / Build */}
            <div>
              <h4 className="mb-3 text-lg font-light text-slate-200">Nodes:</h4>
              <div className="grid grid-cols-3 gap-3">
                <button
                  className="rounded-sm bg-indigo-600 px-3 py-1.5 text-[15px] text-white transition hover:bg-indigo-500"
                  onClick={() => addNode("input")}
                >
                  + Input
                </button>
                <button
                  className="rounded-sm border border-slate-600 bg-transparent px-3 py-1.5 text-[15px] text-slate-300 transition hover:bg-slate-700 hover:text-white"
                  onClick={() => addNode("operation")}
                >
                  + Op
                </button>
                <button
                  className="rounded-sm border border-slate-600 bg-transparent px-3 py-1.5 text-[15px] text-slate-300 transition hover:bg-slate-700 hover:text-white disabled:opacity-50"
                  onClick={() => addNode("output")}
                  disabled={hasOutputNode}
                >
                  + Out
                </button>
              </div>
            </div>

            <hr className="my-5 border-slate-700" />

            {/* Evaluation */}
            <div>
              <h4 className="mb-3 text-lg font-light text-slate-200">Evaluation:</h4>
              <div className="grid grid-cols-3 gap-3">
                <button
                  className="rounded-sm bg-indigo-600 px-3 py-1.5 text-[15px] text-white transition hover:bg-indigo-500"
                  onClick={() => runEvaluation("forward")}
                >
                  Forward
                </button>
                <button
                  className="rounded-sm bg-slate-700 px-3 py-1.5 text-[15px] text-slate-200 transition hover:bg-slate-600"
                  onClick={() => runEvaluation("backward")}
                >
                  Backprop
                </button>
                <button
                  className="rounded-sm border border-slate-600 bg-transparent px-3 py-1.5 text-[15px] text-slate-300 transition hover:bg-slate-700 hover:text-white"
                  onClick={() => resetComputedState()}
                >
                  Clear
                </button>
              </div>
            </div>

            <hr className="my-5 border-slate-700" />

            {/* Legend */}
            <div>
              <h4 className="mb-2 text-lg font-light text-slate-200">Style / Legend:</h4>
              <div className="space-y-2 text-[15px] text-slate-300">
                <div className="flex items-center gap-3">
                  <span className="inline-block h-3 w-6 rounded-sm bg-[#22c55e]" />
                  <span>Forward value (above edge)</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-block h-3 w-6 rounded-sm bg-[#ef4444]" />
                  <span>Gradient (below edge)</span>
                </div>
              </div>
              <p className="mt-4 text-[13px] text-slate-400">
                Click a node to edit its properties inline.
              </p>
            </div>
          </div>
        </div>
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
