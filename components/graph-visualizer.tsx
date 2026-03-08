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

import { COMPUTATION_EXAMPLES } from "@/lib/examples";
import { evaluateGraph, type EvaluationMode } from "@/lib/graph-evaluator";
import {
  getOperationArity,
  OPERATION_LABELS,
  type GraphEdgeSpec,
  type GraphNodeKind,
  type GraphNodeSpec,
  type ComputationExample,
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
  isDarkMode: boolean;
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
const DRAGGING_EDGE_STYLE = { stroke: "#94a3b8", strokeWidth: 1.5, strokeDasharray: "4 4" };
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
  // Split on $$ first (display math rendered inline), then on $ (inline math)
  const segments: React.ReactNode[] = [];
  // Use regex to split: $$...$$  or $...$
  const regex = /\$\$([^$]+?)\$\$|\$([^$]+?)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      segments.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    const mathContent = match[1] ?? match[2]; // match[1] = $$, match[2] = $
    const isDisplay = match[1] !== undefined; // was $$...$$
    segments.push(
      <span
        key={key++}
        style={isDisplay
          ? { display: "block", textAlign: "center", overflowX: "auto", overflowY: "hidden", maxWidth: "100%", verticalAlign: "middle" }
          : { display: "inline-block", verticalAlign: "middle" }
        }
      >
        <InlineMath math={mathContent} />
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  // Remaining text
  if (lastIndex < text.length) {
    segments.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }
  return segments;
}

function ToneBanner({ status }: { status: StatusState }) {
  const { isDarkMode } = useGraphEditor();
  const toneClasses: Record<StatusTone, string> = {
    info: `border-sky-500/30 bg-sky-500/10 ${isDarkMode ? "text-slate-300" : "text-sky-900"}`,
    success: `border-emerald-500/30 bg-emerald-500/10 ${isDarkMode ? "text-slate-300" : "text-emerald-900"}`,
    error: `border-rose-500/30 bg-rose-500/10 ${isDarkMode ? "text-slate-300" : "text-rose-900"}`,
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${toneClasses[status.tone]}`}>
      {renderTextWithMath(status.text)}
    </div>
  );
}

/* ─── Compact Node Components ─── */

const CIRCLE_SIZE = 44;

function getCircleStyle(isDarkMode: boolean): React.CSSProperties {
  return {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 600,
    cursor: "grab",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: isDarkMode ? "#64748b" : "#cbd5e1",
    background: isDarkMode ? "#1e293b" : "#ffffff",
    color: isDarkMode ? "#e2e8f0" : "#0f172a",
    position: "relative",
  };
}

function getHandleStyle(isDarkMode: boolean): React.CSSProperties {
  return {
    width: 8,
    height: 8,
    backgroundColor: isDarkMode ? "#94a3b8" : "#cbd5e1",
    border: isDarkMode ? "1.5px solid #0f172a" : "1.5px solid #ffffff",
  };
}

const SmartNumberInput = memo(function SmartNumberInput({
  value,
  onUpdate,
  className,
}: {
  value: number;
  onUpdate: (val: number) => void;
  className: string;
}) {
  const [localText, setLocalText] = useState(value.toString());

  useEffect(() => {
    const parsedLocal = parseFloat(localText);
    if (parsedLocal !== value) {
      setLocalText(value.toString());
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    // Allow digits, decimal point, and leading minus
    if (/^-?\d*\.?\d*$/.test(text) || text === "") {
      setLocalText(text);

      // Only push to parent if it's a "complete" number string
      if (text !== "" && text !== "-" && text !== "." && text !== "-." && !text.endsWith(".")) {
        const num = Number(text);
        if (!isNaN(num)) {
          onUpdate(num);
        }
      }
    }
  };

  return (
    <input
      className={className}
      value={localText}
      onChange={handleChange}
      onBlur={() => {
        const num = Number(localText);
        if (isNaN(num) || localText === "") {
          const fallback = 0;
          onUpdate(fallback);
          setLocalText(fallback.toString());
        } else {
          onUpdate(num);
          setLocalText(num.toString()); // Normalize view (e.g., "-0" -> "0", "05" -> "5")
        }
      }}
    />
  );
});

const InputNode = memo(function InputNode({ id, data, selected }: NodeProps<InputEditorNode>) {
  const editor = useGraphEditor();
  const nodeRef = useRef<HTMLDivElement>(null);
  const toolbarPos = useToolbarPosition(nodeRef);

  return (
    <div ref={nodeRef} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <NodeToolbar isVisible={selected} position={toolbarPos} className={`flex w-40 flex-col gap-2 rounded-lg border p-3 shadow-xl ${editor.isDarkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
        <div className="flex flex-col gap-1">
          <label className={`text-[10px] font-bold uppercase ${editor.isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Label</label>
          <input className={`nodrag w-full rounded border px-2 py-1 text-xs outline-none focus:border-indigo-500 ${editor.isDarkMode ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-slate-50 text-slate-900"}`} value={data.label} onChange={(e) => editor.updateLabel(id, e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={`text-[10px] font-bold uppercase ${editor.isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Value</label>
          <SmartNumberInput 
            className={`nodrag w-full rounded border px-2 py-1 text-xs outline-none focus:border-indigo-500 ${editor.isDarkMode ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-slate-50 text-slate-900"}`} 
            value={data.value ?? 0} 
            onUpdate={(val) => editor.updateValue(id, val)} 
          />
        </div>
        <div className="mt-1 space-y-1 text-xs">
          <div className={`flex justify-between gap-4 rounded px-2 py-1 ${editor.isDarkMode ? "bg-slate-800" : "bg-slate-100"}`}>
            <span className={editor.isDarkMode ? "text-slate-400" : "text-slate-500"}>Data</span>
            <span className={`font-mono ${editor.isDarkMode ? "text-emerald-400" : "text-emerald-600"}`}>{formatNumber(data.resultValue) || "—"}</span>
          </div>
          <div className={`flex justify-between gap-4 rounded px-2 py-1 ${editor.isDarkMode ? "bg-slate-800" : "bg-slate-100"}`}>
            <span className={editor.isDarkMode ? "text-slate-400" : "text-slate-500"}>Grad</span>
            <span className={`font-mono ${editor.isDarkMode ? "text-rose-400" : "text-rose-600"}`}>{formatNumber(data.grad) || "—"}</span>
          </div>
        </div>
      </NodeToolbar>
      {/* Empty space for alignment */}
      <div style={{ height: 18 }} />
      {/* Circle */}
      <div style={{ ...getCircleStyle(editor.isDarkMode), borderColor: "#22c55e", background: editor.isDarkMode ? "#0f172a" : "#f0fdf4", color: editor.isDarkMode ? "#e2e8f0" : "#14532d" }}>
        {/* Label left */}
        <div
          style={{
            position: "absolute",
            right: "100%",
            marginRight: 10,
            fontSize: 12,
            fontWeight: 500,
            color: editor.isDarkMode ? "#e2e8f0" : "#475569",
            whiteSpace: "nowrap",
          }}
        >
          <InlineMath math={data.label} />
        </div>
        <span style={{ fontSize: 11 }}>●</span>
        <Handle
          type="source"
          position={Position.Right}
          style={getHandleStyle(editor.isDarkMode)}
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
      <NodeToolbar isVisible={selected} position={toolbarPos} className={`flex w-40 flex-col gap-2 rounded-lg border p-3 shadow-xl ${editor.isDarkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
        <div className="flex flex-col gap-1">
          <label className={`text-[10px] font-bold uppercase ${editor.isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Label</label>
          <input className={`nodrag w-full rounded border px-2 py-1 text-xs outline-none focus:border-indigo-500 ${editor.isDarkMode ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-slate-50 text-slate-900"}`} value={data.label} onChange={(e) => editor.updateLabel(id, e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={`text-[10px] font-bold uppercase ${editor.isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Operation</label>
          <select className={`nodrag w-full rounded border px-2 py-1 text-xs outline-none focus:border-indigo-500 ${editor.isDarkMode ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-slate-50 text-slate-900"}`} value={op} onChange={(e) => editor.updateOperation(id, e.target.value as SupportedOperation)}>
            {Object.entries(OPERATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{value} · {label}</option>
            ))}
          </select>
        </div>
        {op === "pow" && (
          <div className="flex flex-col gap-1">
            <label className={`text-[10px] font-bold uppercase ${editor.isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Exponent</label>
            <SmartNumberInput 
              className={`nodrag w-full rounded border px-2 py-1 text-xs outline-none focus:border-indigo-500 ${editor.isDarkMode ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-slate-50 text-slate-900"}`} 
              value={data.parameter ?? 2} 
              onUpdate={(val) => editor.updateParameter(id, val)} 
            />
          </div>
        )}
        <div className="mt-1 space-y-1 text-xs">
          <div className={`flex justify-between gap-4 rounded px-2 py-1 ${editor.isDarkMode ? "bg-slate-800" : "bg-slate-100"}`}>
            <span className={editor.isDarkMode ? "text-slate-400" : "text-slate-500"}>Data</span>
            <span className={`font-mono ${editor.isDarkMode ? "text-emerald-400" : "text-emerald-600"}`}>{formatNumber(data.resultValue) || "—"}</span>
          </div>
          <div className={`flex justify-between gap-4 rounded px-2 py-1 ${editor.isDarkMode ? "bg-slate-800" : "bg-slate-100"}`}>
            <span className={editor.isDarkMode ? "text-slate-400" : "text-slate-500"}>Grad</span>
            <span className={`font-mono ${editor.isDarkMode ? "text-rose-400" : "text-rose-600"}`}>{formatNumber(data.grad) || "—"}</span>
          </div>
        </div>
      </NodeToolbar>
      <div style={{ height: 18 }} />
      <div style={{ ...getCircleStyle(editor.isDarkMode), borderColor: "#3b82f6", background: editor.isDarkMode ? "#0f172a" : "#eff6ff", color: editor.isDarkMode ? "#e2e8f0" : "#1e3a8a" }}>
        {/* Label top */}
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            marginBottom: 6,
            fontSize: 12,
            fontWeight: 500,
            color: editor.isDarkMode ? "#94a3b8" : "#64748b",
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
          style={{ ...getHandleStyle(editor.isDarkMode), top: "50%" }}
        />
      ) : (
        <>
          <Handle
            type="target"
            id="a"
            position={Position.Left}
            style={{ ...getHandleStyle(editor.isDarkMode), top: "30%" }}
          />
          <Handle
            type="target"
            id="b"
            position={Position.Left}
            style={{ ...getHandleStyle(editor.isDarkMode), top: "70%" }}
          />
        </>
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={getHandleStyle(editor.isDarkMode)}
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
      <NodeToolbar isVisible={selected} position={toolbarPos} className={`flex w-40 flex-col gap-2 rounded-lg border p-3 shadow-xl ${editor.isDarkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
        <div className="flex flex-col gap-1">
          <label className={`text-[10px] font-bold uppercase ${editor.isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Label</label>
          <input className={`nodrag w-full rounded border px-2 py-1 text-xs outline-none focus:border-indigo-500 ${editor.isDarkMode ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-slate-50 text-slate-900"}`} value={data.label} onChange={(e) => editor.updateLabel(id, e.target.value)} />
        </div>
        <div className="mt-1 space-y-1 text-xs">
          <div className={`flex justify-between gap-4 rounded px-2 py-1 ${editor.isDarkMode ? "bg-slate-800" : "bg-slate-100"}`}>
            <span className={editor.isDarkMode ? "text-slate-400" : "text-slate-500"}>Data</span>
            <span className={`font-mono ${editor.isDarkMode ? "text-emerald-400" : "text-emerald-600"}`}>{formatNumber(data.resultValue) || "—"}</span>
          </div>
          <div className={`flex justify-between gap-4 rounded px-2 py-1 ${editor.isDarkMode ? "bg-slate-800" : "bg-slate-100"}`}>
            <span className={editor.isDarkMode ? "text-slate-400" : "text-slate-500"}>Grad</span>
            <span className={`font-mono ${editor.isDarkMode ? "text-rose-400" : "text-rose-600"}`}>{formatNumber(data.grad) || "—"}</span>
          </div>
        </div>
      </NodeToolbar>
      {/* Empty space for alignment */}
      <div style={{ height: 22 }} />
      <div style={{ ...getCircleStyle(editor.isDarkMode), borderColor: "#f59e0b", background: editor.isDarkMode ? "#0f172a" : "#fffbeb", color: editor.isDarkMode ? "#e2e8f0" : "#78350f", width: 36, height: 36 }}>
        {/* Label top */}
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            marginBottom: 6,
            fontSize: 12,
            fontWeight: 500,
            color: editor.isDarkMode ? "#94a3b8" : "#64748b",
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
          style={getHandleStyle(editor.isDarkMode)}
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

function VisualizerCanvas() {
  const { fitView, getNodesBounds, setViewport } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<EditorNode>(
    COMPUTATION_EXAMPLES[0].nodes.map(toEditorNode),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<EditorEdge>(
    COMPUTATION_EXAMPLES[0].edges.map(toEditorEdge),
  );
  const [selectedExampleId, setSelectedExampleId] = useState(COMPUTATION_EXAMPLES[0].id);
  const [status, setStatus] = useState<StatusState>({
    tone: "info",
    text: COMPUTATION_EXAMPLES[0].description,
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isLocked, setIsLocked] = useState(false);

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
      isDarkMode,
      updateLabel,
      updateValue,
      updateOperation,
      updateParameter,
    }),
    [isDarkMode, updateLabel, updateOperation, updateParameter, updateValue],
  );

  const loadExample = useCallback(
    (example: ComputationExample) => {
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
                  label: `x_${base.length + 1}`,
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
                    label: "",
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
                    label: "\\text{out}",
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
          title: COMPUTATION_EXAMPLES.find(e => e.id === selectedExampleId)?.title || "",
          description: COMPUTATION_EXAMPLES.find(e => e.id === selectedExampleId)?.description || "",
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
      <div className={`relative h-screen w-screen overflow-hidden font-light transition-colors duration-300 ${isDarkMode ? "bg-slate-900 text-slate-100" : "bg-[#f8f9fa] text-slate-800"}`}>
        {/* Main Canvas */}
        <main className={`absolute inset-0 transition-colors duration-300 ${isDarkMode ? "bg-slate-900" : "bg-[#ffffff]"}`}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={isLocked ? () => {} : handleNodesChange}
            onEdgesChange={isLocked ? () => {} : handleEdgesChange}
            onConnect={isLocked ? () => {} : onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitViewOptions={fitViewConfig}
            connectionLineStyle={DRAGGING_EDGE_STYLE}
            deleteKeyCode={isLocked ? [] : ["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            colorMode={isDarkMode ? "dark" : "light"}
            nodesDraggable={!isLocked}
            nodesConnectable={!isLocked}
            elementsSelectable={!isLocked}
            edgesReconnectable={!isLocked}
            edgesFocusable={!isLocked}
            className="h-full w-full"
          >
            <Controls position="bottom-right" showFitView={false} showInteractive={false}>
              <ControlButton onClick={() => fitGraphToVisibleArea(250)} title="Fit to screen" aria-label="Fit graph to screen">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <polyline points="9 21 3 21 3 15"></polyline>
                  <line x1="21" y1="3" x2="14" y2="10"></line>
                  <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
              </ControlButton>
              <ControlButton onClick={() => setIsLocked(!isLocked)} title={isLocked ? "Unlock graph" : "Lock graph"} aria-label={isLocked ? "Unlock graph" : "Lock graph"}>
                {isLocked ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                  </svg>
                )}
              </ControlButton>
            </Controls>
            <Background gap={20} size={1} color={isDarkMode ? "rgba(148, 163, 184, 0.08)" : "rgba(148, 163, 184, 0.2)"} />
          </ReactFlow>
        </main>

        {/* Theme Toggle Button */}
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className={`absolute top-4 right-5 z-20 flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-colors border ${
            isDarkMode
              ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
          aria-label="Toggle Theme"
        >
          {isDarkMode ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
          )}
        </button>

        {/* NN-SVG Style Floating Sidebar */}
        <div className={`absolute top-2.5 left-2.5 z-10 flex max-h-[calc(100vh-60px)] w-102.5 flex-col rounded border shadow-2xl transition-colors duration-300 ${isDarkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"}`}>
          {/* Card Header */}
          <div className={`border-b px-5 pt-4 pb-0 transition-colors duration-300 ${isDarkMode ? "border-slate-700 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-800 rounded-t"}`}>
            <button 
              className={`float-right mt-1 text-2xl transition-transform ${isDarkMode ? "text-slate-400 hover:text-white" : "text-slate-400 hover:text-slate-900"}`}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{ transform: isSidebarOpen ? "rotate(0deg)" : "rotate(-180deg)" }}
              aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </button>
            <h1 className="mb-1 text-[2.5rem] font-thin leading-none tracking-wide">
              GraphGrad
            </h1>
            <p className={`mb-4 text-[15px] font-light ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
              Computation Graph Visualizer. <a href="#" onClick={(e) => { e.preventDefault(); clearCanvas(); }} className={`hover:underline ${isDarkMode ? "text-indigo-400 hover:text-indigo-300" : "text-indigo-600 hover:text-indigo-500"}`}>Clear Canvas</a>
            </p>

            {/* Simulated Tabs matching NN-SVG Nav Tabs */}
            <nav className={`flex translate-y-px space-x-1 border-b ${isDarkMode ? "border-slate-700" : "border-slate-200"}`}>
            </nav>
          </div>

          {/* Card Body */}
          <div className={`overflow-y-auto p-5 transition-all [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full ${isDarkMode ? "[&::-webkit-scrollbar-thumb]:bg-slate-600" : "[&::-webkit-scrollbar-thumb]:bg-slate-300"} ${isSidebarOpen ? "block" : "hidden"}`}>
            
            <ToneBanner status={status} />
            <hr className={`my-3 ${isDarkMode ? "border-slate-700" : "border-slate-200"}`} />

            {/*Examples */}
            <div>
              <h4 className={`mb-3 text-lg font-light ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>Examples:</h4>
              <select
                className={`w-full rounded border px-3 py-2 text-[15px] font-light outline-none ${isDarkMode ? "border-slate-600 bg-slate-900 text-slate-100 focus:border-indigo-500" : "border-slate-300 bg-slate-50 text-slate-900 focus:border-indigo-500 focus:bg-white"}`}
                value={selectedExampleId}
                onChange={(event) => {
                  const next = COMPUTATION_EXAMPLES.find((e) => e.id === event.target.value);
                  if (next) loadExample(next);
                }}
              >
                {COMPUTATION_EXAMPLES.map((example) => (
                  <option key={example.id} value={example.id}>
                    {example.title}
                  </option>
                ))}
              </select>
            </div>

            <hr className={`my-3 ${isDarkMode ? "border-slate-700" : "border-slate-200"}`} />

            {/* Nodes / Build */}
            <div>
              <h4 className={`mb-3 text-lg font-light ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>Nodes:</h4>
              <div className="grid grid-cols-3 gap-3">
                <button
                  className="rounded-sm bg-indigo-600 px-3 py-1.5 text-[15px] text-white transition hover:bg-indigo-500"
                  onClick={() => addNode("input")}
                >
                  + Input
                </button>
                <button
                  className={`rounded-sm border px-3 py-1.5 text-[15px] transition bg-transparent ${isDarkMode ? "border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white" : "border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
                  onClick={() => addNode("operation")}
                >
                  + Op
                </button>
                <span
                  className="w-full"
                  title={hasOutputNode ? "There can be only one out node." : "Add an output node."}
                >
                  <button
                    className={`w-full rounded-sm border px-3 py-1.5 text-[15px] transition bg-transparent disabled:opacity-50 disabled:cursor-not-allowed ${isDarkMode ? "border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white" : "border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
                    onClick={() => addNode("output")}
                    disabled={hasOutputNode}
                    aria-label={hasOutputNode ? "There can be only one out node" : "Add an output node"}
                  >
                    + Out
                  </button>
                </span>
              </div>
            </div>
            <p className={`mt-4 text-[13px] ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                Drag from the end handle of one node to another node to create an edge.
            </p>

            <hr className={`my-3 ${isDarkMode ? "border-slate-700" : "border-slate-200"}`} />

            {/* Evaluation */}
            <div>
              <h4 className={`mb-3 text-lg font-light ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>Evaluation:</h4>
              <div className="grid grid-cols-3 gap-3">
                <button
                  className="rounded-sm bg-indigo-600 px-3 py-1.5 text-[15px] text-white transition hover:bg-indigo-500"
                  onClick={() => runEvaluation("forward")}
                >
                  Forward
                </button>
                <button
                  className={`rounded-sm px-3 py-1.5 text-[15px] transition ${isDarkMode ? "bg-slate-700 text-slate-200 hover:bg-slate-600" : "bg-slate-200 text-slate-800 hover:bg-slate-300"}`}
                  onClick={() => runEvaluation("backward")}
                >
                  Backprop
                </button>
                <button
                  className={`rounded-sm border px-3 py-1.5 text-[15px] transition bg-transparent ${isDarkMode ? "border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white" : "border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
                  onClick={() => resetComputedState()}
                >
                  Clear
                </button>
              </div>
            </div>
            

            <hr className={`my-3 ${isDarkMode ? "border-slate-700" : "border-slate-200"}`} />

            {/* Legend */}
            <div>
              <h4 className={`mb-2 text-lg font-light ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>Style / Legend:</h4>
              <div className={`space-y-2 text-[15px] ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
                <div className="flex items-center gap-3">
                  <span className="inline-block h-3 w-6 rounded-sm bg-[#22c55e]" />
                  <span>Forward value (above edge)</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-block h-3 w-6 rounded-sm bg-[#ef4444]" />
                  <span>Gradient (below edge)</span>
                </div>
              </div>
              <p className={`mt-4 text-[13px] ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                Click a node to edit its properties inline.
              </p>
            </div>
          </div>
        </div>
      </div>
    </GraphEditorContext.Provider>
  );
}

export default function GraphVisualizer() {
  return (
    <ReactFlowProvider>
      <VisualizerCanvas />
    </ReactFlowProvider>
  );
}
