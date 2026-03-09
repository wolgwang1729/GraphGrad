"use client";

import "@xyflow/react/dist/style.css";

import {
  addEdge,
  Background,
  BaseEdge,
  ControlButton,
  Controls,
  EdgeLabelRenderer,
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
  useEdges,
  useNodesData,
  useNodesState,
  useReactFlow,
  useUpdateNodeInternals,
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
import { Logo } from "./logo";
import {
  getOperationArity,
  OPERATION_LABELS,
  type GraphEdgeSpec,
  type GraphNodeKind,
  type GraphNodeSpec,
  type ComputationExample,
  type SupportedOperation,
} from "@/lib/graph-types";

import { parseEquationToGraph } from "@/lib/equation-parser";

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
  isLocked: boolean;
  updateLabel: (nodeId: string, label: string) => void;
  updateValue: (nodeId: string, value: number) => void;
  updateOperation: (nodeId: string, op: SupportedOperation) => void;
  updateParameter: (nodeId: string, parameter: number) => void;
  showError: (message: string) => void;
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
const DRAGGING_EDGE_STYLE = { stroke: "#94a3b8", strokeWidth: 1.5, strokeDasharray: "4 4", markerEnd: "url(#graphgrad-edge-arrow-active)" };
const EDGE_TARGET_GAP_PX = -4;
const STRAIGHT_EDGE_TARGET_GAP_PX = -2;

const FIT_VIEW_PADDING = 0.2;
const SIDEBAR_RESERVED_WIDTH_PX = 430;
const SIDEBAR_COLLAPSED_RESERVED_WIDTH_PX = 0;
const MOBILE_BREAKPOINT_PX = 640;
const MOBILE_SIDEBAR_LEFT_OFFSET_PX = 10;
const MOBILE_SIDEBAR_RIGHT_GAP_PX = 64;
const MOBILE_SIDEBAR_MIN_WIDTH_PX = 256;
const MOBILE_SIDEBAR_MAX_WIDTH_PX = 320;

const TOOLBAR_THRESHOLD_PX = 150;

const OPERATION_MATH_LABELS: Record<SupportedOperation, string> = {
  add: "+",
  mul: "\\times",
  sub: "-",
  div: "\\div",
  pow: "x^{n}",
  neg: "-x",
  relu: "\\operatorname{ReLU}",
  tanh: "\\tanh",
  exp: "\\exp",
  sigmoid: "\\sigma",
  max: "\\max",
  log: "\\operatorname{ln}",
};

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
    return value > 0 ? "\\infty" : "−\\infty";
  }

  return value.toFixed(2);
}

function getOperationMathLabel(op: SupportedOperation, parameter?: number): string {
  if (op === "pow") {
    return `x^{${parameter ?? 2}}`;
  }

  return OPERATION_MATH_LABELS[op] ?? OPERATION_LABELS[op];
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

function getSidebarReservedWidth(windowWidth: number, isSidebarOpen: boolean): number {
  if (!isSidebarOpen) {
    return SIDEBAR_COLLAPSED_RESERVED_WIDTH_PX;
  }

  if (windowWidth < MOBILE_BREAKPOINT_PX) {
    const sidebarWidth = Math.max(
      Math.min(
        windowWidth - MOBILE_SIDEBAR_LEFT_OFFSET_PX - MOBILE_SIDEBAR_RIGHT_GAP_PX,
        MOBILE_SIDEBAR_MAX_WIDTH_PX,
      ),
      Math.min(MOBILE_SIDEBAR_MIN_WIDTH_PX, windowWidth - 32),
    );

    return Math.min(sidebarWidth + MOBILE_SIDEBAR_LEFT_OFFSET_PX, windowWidth - 16);
  }

  return SIDEBAR_RESERVED_WIDTH_PX;
}

function getInputLabelSubscript(label: string): number | null {
  const match = label.trim().match(/_(?:\{\s*(-?\d+)\s*\}|(-?\d+))$/);
  const rawValue = match?.[1] ?? match?.[2];

  if (!rawValue) {
    return null;
  }

  const subscript = Number.parseInt(rawValue, 10);
  return Number.isNaN(subscript) ? null : subscript;
}

function getNextInputLabel(nodes: EditorNode[]): string {
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
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  style,
}: EdgeProps<Edge<LabeledEdgeData>>) {
  const sourceNodeData = useNodesData<EditorNode>(source);
  const targetNodeData = useNodesData<EditorNode>(target);
  const strokeColor = typeof style?.stroke === "string" ? style.stroke : EDGE_BASE_STYLE.stroke;
  const markerEnd = strokeColor === "#475569"
    ? "url(#graphgrad-edge-arrow-muted)"
    : "url(#graphgrad-edge-arrow-active)";
  const isStraight = Math.abs(sourceY - targetY) < 1.5;
  const targetGap = isStraight ? STRAIGHT_EDGE_TARGET_GAP_PX : EDGE_TARGET_GAP_PX;

  function getShortenedTargetPoint(startX: number, startY: number, endX: number, endY: number) {
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.hypot(dx, dy);

    if (length <= Math.abs(targetGap) || length === 0) {
      return { x: endX, y: endY };
    }

    const scale = (length - targetGap) / length;
    return {
      x: startX + dx * scale,
      y: startY + dy * scale,
    };
  }

  const midX = (sourceX + targetX) / 2;
  const shortenedTarget = isStraight
    ? getShortenedTargetPoint(sourceX, sourceY, targetX, targetY)
    : getShortenedTargetPoint(midX, sourceY, targetX, targetY);
  const edgePath = isStraight
    ? `M ${sourceX},${sourceY} L ${shortenedTarget.x},${shortenedTarget.y}`
    : `M ${sourceX},${sourceY} L ${midX},${sourceY} L ${shortenedTarget.x},${shortenedTarget.y}`;
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
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {hasLabels && (
        <EdgeLabelRenderer>
          {forwardText && (
            <div
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 10}px)`,
                pointerEvents: "none",
                fontSize: 11,
              }}
              className="nodrag nopan"
            >
              <InlineMath math={`\\textcolor{#22c55e}{${forwardText}}`} />
            </div>
          )}
          {gradText && (
            <div
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY + 13}px)`,
                pointerEvents: "none",
                fontSize: 11,
              }}
              className="nodrag nopan"
            >
              <InlineMath math={`\\textcolor{#ef4444}{${gradText}}`} />
            </div>
          )}
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes: EdgeTypes = {
  labeledEdge: LabeledEdge,
};

function EdgeMarkers() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute h-0 w-0"
      focusable="false"
    >
      <defs>
        <marker
          id="graphgrad-edge-arrow-active"
          markerWidth="9"
          markerHeight="9"
          refX="7.7"
          refY="4.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M 0.9 0.95 L 7.7 4.5 L 0.9 8.05 L 2.35 4.5 Z"
            fill="#94a3b8"
            stroke="#94a3b8"
            strokeLinejoin="round"
          />
        </marker>
        <marker
          id="graphgrad-edge-arrow-muted"
          markerWidth="9"
          markerHeight="9"
          refX="7.7"
          refY="4.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M 0.9 0.95 L 7.7 4.5 L 0.9 8.05 L 2.35 4.5 Z"
            fill="#475569"
            stroke="#475569"
            strokeLinejoin="round"
          />
        </marker>
      </defs>
    </svg>
  );
}

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

function getTargetHandleStyle(isDarkMode: boolean, isConnected: boolean, isLocked: boolean): React.CSSProperties {
  return {
    width: 8,
    height: 8,
    opacity: isConnected ? 0 : 1,
    backgroundColor: isDarkMode ? "#94a3b8" : "#cbd5e1",
    border: isDarkMode ? "1.5px solid #0f172a" : "1.5px solid #ffffff",
    boxShadow: "none",
    transition: "opacity 0.1s ease-in-out",
    cursor: isLocked ? "default" : "crosshair",
  };
}

function getSourceHandleStyle(isDarkMode: boolean, isLocked: boolean): React.CSSProperties {
  return {
    width: 8,
    height: 8,
    backgroundColor: isDarkMode ? "#94a3b8" : "#cbd5e1",
    border: isDarkMode ? "1.5px solid #0f172a" : "1.5px solid #ffffff",
    boxShadow: "none",
    cursor: isLocked ? "default" : "crosshair",
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
    let parsedLocal: number;
    if (localText.includes('/')) {
      const parts = localText.split('/');
      parsedLocal = Number(parts[0]) / (parts[1] !== "" ? Number(parts[1]) : 1);
    } else {
      parsedLocal = Number(localText);
    }

    if (parsedLocal !== value) {
      setLocalText(value.toString());
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    // Allow digits, decimal point, leading minus, and an optional slash with more digits
    if (/^-?\d*\.?\d*(\/\d*)?$/.test(text) || text === "") {
      setLocalText(text);

      // Only push to parent if it's a "complete" number string
      if (text !== "" && text !== "-" && text !== "." && text !== "-." && !text.endsWith(".") && !text.endsWith("/")) {
        let num: number;
        if (text.includes('/')) {
          const parts = text.split('/');
          num = Number(parts[0]) / (parts[1] !== "" ? Number(parts[1]) : 1);
        } else {
          num = Number(text);
        }

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
        let num: number;
        if (localText.includes('/')) {
          const parts = localText.split('/');
          num = Number(parts[0]) / (parts[1] !== "" ? Number(parts[1]) : 1);
        } else {
          num = Number(localText);
        }

        if (isNaN(num) || localText === "") {
          const fallback = 0;
          onUpdate(fallback);
          setLocalText(fallback.toString());
        } else {
          onUpdate(num);
          if (localText.includes('/')) {
            setLocalText(localText);
          } else {
            setLocalText(num.toString()); // Normalize view (e.g., "-0" -> "0", "05" -> "5")
          }
        }
      }}
    />
  );
});

const OperationSelect = memo(function OperationSelect({
  value,
  parameter,
  isDarkMode,
  onChange,
}: {
  value: SupportedOperation;
  parameter?: number;
  isDarkMode: boolean;
  onChange: (value: SupportedOperation) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className={`nodrag cursor-pointer flex w-full items-center justify-between rounded border px-2 py-1 text-xs outline-none focus:border-indigo-500 ${isDarkMode ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-slate-50 text-slate-900"}`}
        onClick={() => setIsOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          <span className="font-mono opacity-80">{value}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center">
            <InlineMath math={getOperationMathLabel(value, parameter)} />
          </span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${isOpen ? "rotate-180" : "rotate-0"}`}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30 rounded border shadow-xl ${isDarkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}
          role="listbox"
          aria-label="Operation"
        >
          {Object.keys(OPERATION_LABELS).map((operation) => {
            const optionValue = operation as SupportedOperation;

            return (
              <button
                key={optionValue}
                type="button"
                role="option"
                aria-selected={optionValue === value}
                className={`flex w-full cursor-pointer items-center justify-between px-2 py-1.5 text-left text-xs transition ${optionValue === value
                  ? isDarkMode
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-900"
                  : isDarkMode
                    ? "text-slate-200 hover:bg-slate-800"
                    : "text-slate-700 hover:bg-slate-50"
                  }`}
                onClick={() => {
                  onChange(optionValue);
                  setIsOpen(false);
                }}
              >
                <span className="font-mono opacity-80">{optionValue}</span>
                <span className="ml-3 inline-flex items-center justify-end">
                  <InlineMath math={getOperationMathLabel(optionValue)} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

const InputNode = memo(function InputNode({ id, data, selected, dragging }: NodeProps<InputEditorNode>) {
  const editor = useGraphEditor();
  const nodeRef = useRef<HTMLDivElement>(null);
  const toolbarPos = useToolbarPosition(nodeRef);
  const [wasDragged, setWasDragged] = useState(false);

  useEffect(() => {
    if (dragging) setWasDragged(true);
  }, [dragging]);

  useEffect(() => {
    if (!selected) setWasDragged(false);
  }, [selected]);

  return (
    <div
      ref={nodeRef}
      style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
      onClick={() => {
        if (selected) {
          setWasDragged(!wasDragged);
        } else {
          setWasDragged(false);
        }
      }}
    >
      <NodeToolbar
        isVisible={selected && !dragging && !wasDragged}
        position={toolbarPos}
        className={`nodrag nopan flex w-40 flex-col gap-2 rounded-lg border p-3 shadow-xl ${editor.isDarkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}
        onClick={(e) => e.stopPropagation()}
      >
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
          isConnectable={!editor.isLocked}
          style={{ ...getSourceHandleStyle(editor.isDarkMode, editor.isLocked), top: "50%" }}
        />
      </div>
    </div>
  );
});

const OperationNode = memo(function OperationNode({ id, data, selected, dragging }: NodeProps<OperationEditorNode>) {
  const editor = useGraphEditor();
  const edges = useEdges();
  const nodeRef = useRef<HTMLDivElement>(null);
  const toolbarPos = useToolbarPosition(nodeRef);
  const updateNodeInternals = useUpdateNodeInternals();
  const op = data.op ?? DEFAULT_OPERATION;
  const arity = getOperationArity(op);
  const mathStr = getOperationMathLabel(op, data.parameter);
  const [wasDragged, setWasDragged] = useState(false);

  useEffect(() => {
    if (dragging) setWasDragged(true);
  }, [dragging]);

  useEffect(() => {
    if (!selected) setWasDragged(false);
  }, [selected]);

  const isConnectedA = useMemo(() => edges.some(e => e.target === id && e.targetHandle === "a"), [edges, id]);
  const isConnectedB = useMemo(() => edges.some(e => e.target === id && e.targetHandle === "b"), [edges, id]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      updateNodeInternals(id);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [arity, id, op, updateNodeInternals]);

  return (
    <div
      ref={nodeRef}
      style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
      onClick={() => {
        if (selected) {
          setWasDragged(!wasDragged);
        } else {
          setWasDragged(false);
        }
      }}
    >
      <NodeToolbar
        isVisible={selected && !dragging && !wasDragged}
        position={toolbarPos}
        className={`nodrag nopan flex w-40 flex-col gap-2 rounded-lg border p-3 shadow-xl ${editor.isDarkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <label className={`text-[10px] font-bold uppercase ${editor.isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Label</label>
          <input className={`nodrag w-full rounded border px-2 py-1 text-xs outline-none focus:border-indigo-500 ${editor.isDarkMode ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-slate-50 text-slate-900"}`} value={data.label} onChange={(e) => editor.updateLabel(id, e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={`text-[10px] font-bold uppercase ${editor.isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Operation</label>
          <OperationSelect
            value={op}
            parameter={data.parameter}
            isDarkMode={editor.isDarkMode}
            onChange={(value) => editor.updateOperation(id, value)}
          />
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
        <span style={(op === "relu" || op === "tanh" || op === "exp" || op === "max" || op === "log") ? { fontSize: 11 } : undefined}><InlineMath math={mathStr} /></span>
        {arity === 1 ? (
          <Handle
            type="target"
            id="a"
            position={Position.Left}
            isConnectable={!editor.isLocked}
            style={{ ...getTargetHandleStyle(editor.isDarkMode, isConnectedA, editor.isLocked), top: "50%" }}
          />
        ) : (
          <>
            <Handle
              type="target"
              id="a"
              position={Position.Left}
              isConnectable={!editor.isLocked}
              isConnectableStart={false}
              //You can't draw an arrow to the output of something. Start your connection from an output handle (right side) instead."
              style={{ ...getTargetHandleStyle(editor.isDarkMode, isConnectedA, editor.isLocked), top: "30%" }}
            />
            <Handle
              type="target"
              id="b"
              position={Position.Left}
              isConnectable={!editor.isLocked}
              isConnectableStart={false}
              style={{ ...getTargetHandleStyle(editor.isDarkMode, isConnectedB, editor.isLocked), top: "70%" }}
            />
          </>
        )}
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={!editor.isLocked}
          style={{ ...getSourceHandleStyle(editor.isDarkMode, editor.isLocked), top: "50%" }}
        />
      </div>
    </div>
  );
});

const OutputNode = memo(function OutputNode({ id, data, selected, dragging }: NodeProps<OutputEditorNode>) {
  const editor = useGraphEditor();
  const edges = useEdges();
  const nodeRef = useRef<HTMLDivElement>(null);
  const toolbarPos = useToolbarPosition(nodeRef);
  const [wasDragged, setWasDragged] = useState(false);

  useEffect(() => {
    if (dragging) setWasDragged(true);
  }, [dragging]);

  useEffect(() => {
    if (!selected) setWasDragged(false);
  }, [selected]);

  const isConnected = useMemo(() => edges.some(e => e.target === id && e.targetHandle === "in"), [edges, id]);

  return (
    <div
      ref={nodeRef}
      style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
      onClick={() => {
        if (selected) {
          setWasDragged(!wasDragged);
        } else {
          setWasDragged(false);
        }
      }}
    >
      <NodeToolbar
        isVisible={selected && !dragging && !wasDragged}
        position={toolbarPos}
        className={`nodrag nopan flex w-40 flex-col gap-2 rounded-lg border p-3 shadow-xl ${editor.isDarkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}
        onClick={(e) => e.stopPropagation()}
      >
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
          isConnectable={!editor.isLocked}
          isConnectableStart={false}
          onPointerDown={() => editor.showError("You can't draw an arrow to the output of something. Start your connection from an output handle (right side) instead.")}
          style={{ ...getTargetHandleStyle(editor.isDarkMode, isConnected, editor.isLocked), top: "50%" }}
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
  const { fitView, getNodes, getNodesBounds, setViewport } = useReactFlow();
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
  const [equation, setEquation] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isLocked, setIsLocked] = useState(false);

  const fitViewConfig = useMemo(
    () => ({
      padding: FIT_VIEW_PADDING,
      minZoom: 0.1,
      maxZoom: 1.5,
    }),
    [],
  );

  const fitGraphToVisibleArea = useCallback(
    (duration = 300) => {
      if (typeof window === "undefined") {
        return;
      }

      const currentNodes = getNodes();
      const reservedWidth = getSidebarReservedWidth(window.innerWidth, isSidebarOpen);

      if (currentNodes.length === 0) {
        void fitView({ duration, ...fitViewConfig });
        return;
      }

      const bounds = getNodesBounds(currentNodes);
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
    [fitView, fitViewConfig, getNodes, getNodesBounds, isSidebarOpen, setViewport],
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
    setSelectedExampleId("");
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
      setSelectedExampleId("");
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
      setSelectedExampleId("");
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
      setSelectedExampleId("");
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

      setSelectedExampleId("");
      setStatus(DEFAULT_STATUS);
    },
    [setEdges, setNodes],
  );

  const showError = useCallback((message: string) => {
    setStatus({ tone: "error", text: message });
  }, []);

  const editorContextValue = useMemo<EditorContextValue>(
    () => ({
      isDarkMode,
      isLocked,
      updateLabel,
      updateValue,
      updateOperation,
      updateParameter,
      showError,
    }),
    [isDarkMode, isLocked, updateLabel, updateOperation, updateParameter, updateValue, showError],
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

  const handleGenerateEquation = useCallback(() => {
    if (!equation.trim()) {
      setStatus({ tone: "error", text: "Please enter an equation." });
      return;
    }

    try {
      const result = parseEquationToGraph(equation);
      setNodes(result.nodes.map(toEditorNode));
      setEdges(result.edges.map(toEditorEdge));
      // Format equation for display: convert 'relu' to '\operatorname{ReLU}' etc.
      // Use the canonical labels from our operation map for consistency.
      let displayEq = equation;

      // We want to replace any user-typed function name with its canonical LaTeX.
      // We can use a combination of known aliases and SupportedOperations.
      const replacements: Record<string, string> = {
        // Direct SupportedOperation -> LaTeX
        ...OPERATION_MATH_LABELS,
        // Common aliases that mathjs/parser understands
        "ln": "\\operatorname{ln}",
        "multiply": "\\times",
        "divide": "\\div",
        "subtract": "-",
        "add": "+",
      };

      const sortedKeys = Object.keys(replacements).sort((a, b) => b.length - a.length);

      for (const key of sortedKeys) {
        const mathLabel = replacements[key];
        const regex = new RegExp(`\\b${key}\\b`, 'gi');
        displayEq = displayEq.replace(regex, mathLabel);
      }

      setStatus({
        tone: "success",
        text: `Successfully generated graph for: $$${displayEq}$$`
      });

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          fitGraphToVisibleArea(400);
        });
      });
    } catch (err: any) {
      setStatus({ tone: "error", text: `Error generating graph: ${err.message}` });
    }
  }, [equation, setNodes, setEdges, fitGraphToVisibleArea]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<EditorNode>[]) => {
      onNodesChange(changes);

      if (changes.some((change) => change.type === "remove")) {
        setSelectedExampleId("");
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
        setSelectedExampleId("");
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
                label: getNextInputLabel(base),
                value: 1,
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
      setSelectedExampleId("");
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
      setSelectedExampleId("");
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

  return (
    <GraphEditorContext.Provider value={editorContextValue}>
      <div className={`relative h-dvh w-screen overflow-hidden font-light transition-colors duration-300 ${isDarkMode ? "bg-slate-900 text-slate-100" : "bg-[#f8f9fa] text-slate-800"}`}>
        {/* Main Canvas */}
        <main className={`absolute inset-0 transition-colors duration-300 ${isDarkMode ? "bg-slate-900" : "bg-[#ffffff]"}`}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={isLocked ? () => { } : handleNodesChange}
            onEdgesChange={isLocked ? () => { } : handleEdgesChange}
            onConnect={isLocked ? () => { } : onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitViewOptions={fitViewConfig}
            connectionLineStyle={DRAGGING_EDGE_STYLE}
            deleteKeyCode={isLocked ? [] : ["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={0.1}
            colorMode={isDarkMode ? "dark" : "light"}
            nodesDraggable={!isLocked}
            nodesConnectable={!isLocked}
            elementsSelectable={!isLocked}
            edgesReconnectable={!isLocked}
            edgesFocusable={!isLocked}
            className="h-full w-full"
          >
            <EdgeMarkers />
            <Controls position="bottom-right" showFitView={false} showInteractive={false} className="bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]! sm:bottom-4!">
              <ControlButton onClick={() => fitGraphToVisibleArea(250)} title="Fit to screen" aria-label="Fit graph to screen">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <polyline points="9 21 3 21 3 15"></polyline>
                  <line x1="21" y1="3" x2="14" y2="10"></line>
                  <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
              </ControlButton>
              <ControlButton
                onClick={() => setIsLocked(!isLocked)}
                title={isLocked ? "Unlock graph" : "Lock graph"}
                aria-label={isLocked ? "Unlock graph" : "Lock graph"}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={isLocked ? "2" : "1.5"}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    opacity: isLocked ? 1 : 0.6,
                    transform: isLocked ? "scale(1)" : "scale(0.95)",
                    transition: "all 0.2s ease-in-out"
                  }}
                >
                  {/* Body: Tinted when locked, hollow when unlocked */}
                  <rect
                    x="5" y="11" width="14" height="10" rx="2" ry="2"
                    fill="currentColor"
                    fillOpacity={isLocked ? 0.2 : 0}
                    style={{ transition: "fill-opacity 0.2s ease" }}
                  ></rect>

                  {/* Shackle: Lifts up an extra 2px (V5 instead of V7) when unlocked to make the gap visually obvious */}
                  <path
                    d={isLocked ? "M8 11V7a4 4 0 0 1 8 0v4" : "M8 11V5a4 4 0 0 1 8 0"}
                    style={{ transition: "d 0.2s ease" }}
                  ></path>

                  {/* Keyhole */}
                  <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"></circle>
                  <path d="M11.3 15.5 L10.4 18.5 L13.6 18.5 L12.7 15.5 Z" fill="currentColor" stroke="none"></path>
                </svg>
              </ControlButton>
            </Controls>
            <Background gap={20} size={1} color={isDarkMode ? "rgba(148, 163, 184, 0.08)" : "rgba(148, 163, 184, 0.2)"} />
          </ReactFlow>
        </main>

        {/* Theme Toggle Button */}
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className={`absolute top-3 right-3 z-30 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border shadow-lg transition-colors sm:top-4 sm:right-5 ${isDarkMode
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
        <div className={`absolute top-2.5 left-2.5 right-16 z-20 flex max-h-[calc(100dvh-20px)] w-auto min-w-64 max-w-[20rem] flex-col rounded border transition-colors duration-300 sm:right-auto sm:max-h-[calc(100dvh-60px)] sm:w-88 sm:max-w-none lg:w-102.5 ${isDarkMode ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"}`}>
          {/* Card Header */}
          <div className={`border-b px-4 pt-4 pb-0 transition-colors duration-300 sm:px-5 ${isDarkMode ? "border-slate-800 bg-slate-900/80 text-white" : "border-slate-200 bg-slate-100/50 text-slate-800 rounded-t"}`}>
            <button
              className={`float-right cursor-pointer text-2xl transition-transform ${isDarkMode ? "text-slate-400 hover:text-white" : "text-slate-400 hover:text-slate-900"}`}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{ transform: isSidebarOpen ? "rotate(0deg)" : "rotate(-180deg)" }}
              aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </button>
            <h1 className="mb-1 pr-10 text-[2rem] font-thin leading-none tracking-wide sm:text-[2.5rem]">
              GraphGrad
            </h1>
            <p className={`mb-4 text-[15px] font-light ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
              Computation Graph Visualizer
            </p>

            {/* Simulated Tabs matching NN-SVG Nav Tabs */}
            <nav className={`flex translate-y-px space-x-1 border-b ${isDarkMode ? "border-slate-700" : "border-slate-200"}`}>
            </nav>
          </div>

          {/* Card Body */}
          <div className={`overflow-y-auto p-4 transition-all sm:p-5 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full ${isDarkMode ? "[&::-webkit-scrollbar-thumb]:bg-slate-600" : "[&::-webkit-scrollbar-thumb]:bg-slate-300"} ${isSidebarOpen ? "block" : "hidden"}`}>

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
                <option value="" disabled hidden>Custom Graph</option>
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button
                  className="rounded-sm bg-indigo-600 px-3 py-1.5 text-[15px] cursor-pointer text-white transition hover:bg-indigo-500"
                  onClick={() => addNode("input")}
                >
                  + Input
                </button>
                <button
                  className="rounded-sm bg-indigo-600 px-3 py-1.5 text-[15px] cursor-pointer text-white transition hover:bg-indigo-500"
                  onClick={() => addNode("operation")}
                >
                  + Op
                </button>
                <span
                  className="w-full"
                  title={hasOutputNode ? "There can be only one out node." : "Add an output node."}
                >
                  <button
                    className="w-full rounded-sm bg-indigo-600 px-3 py-1.5 text-[15px] cursor-pointer text-white transition hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => addNode("output")}
                    disabled={hasOutputNode}
                    aria-label={hasOutputNode ? "There can be only one out node" : "Add an output node"}
                  >
                    + Out
                  </button>
                </span>
              </div>
            </div>
            <ul className={`mt-2 space-y-0.5 text-[13px] ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500/60" />
                <span>Click a node to edit its properties inline.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500/60" />
                <span>Drag from the end handle of one node to another node to create an edge.</span>
              </li>
            </ul>

            <hr className={`my-3 ${isDarkMode ? "border-slate-700" : "border-slate-200"}`} />

            {/* Evaluation */}
            <div>
              <h4 className={`mb-3 text-lg font-light ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>Evaluation:</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  className="rounded-sm bg-indigo-600 px-3 py-1.5 text-[15px] cursor-pointer text-white transition hover:bg-indigo-500"
                  onClick={() => runEvaluation("forward")}
                >
                  Forward
                </button>
                <button
                  className="rounded-sm bg-indigo-600 px-3 py-1.5 text-[15px] cursor-pointer text-white transition hover:bg-indigo-500"
                  onClick={() => runEvaluation("backward")}
                >
                  Backprop
                </button>
                <button
                  className={`rounded-sm border px-3 py-1.5 text-[15px] cursor-pointer transition bg-transparent ${isDarkMode ? "border-slate-600 text-slate-300 hover:border-red-500 hover:text-red-500" : "border-slate-300 text-slate-600 hover:border-red-500 hover:text-red-500"}`}
                  onClick={() => resetComputedState()}
                >
                  Clear Values
                </button>
                <button
                  className={`rounded-sm border px-3 py-1.5 text-[15px] cursor-pointer transition bg-transparent ${isDarkMode
                    ? "border-red-500/30 text-red-400/80 hover:bg-red-500 hover:text-white hover:border-red-500"
                    : "border-red-200 text-red-600/80 hover:bg-red-500 hover:text-white hover:border-red-500"
                    }`}
                  onClick={() => clearCanvas()}
                >
                  Clear Canvas
                </button>
              </div>
            </div>

            <hr className={`my-3 ${isDarkMode ? "border-slate-700" : "border-slate-200"}`} />

            {/* Equation Input */}
            <div>
              <h4 className={`mb-3 text-lg font-light ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>Equation to Graph:</h4>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="e.g. x + y * 2"
                  className={`w-full rounded border px-3 py-2 text-[15px] font-mono outline-none ${isDarkMode ? "border-slate-600 bg-slate-900 text-slate-100 focus:border-indigo-500" : "border-slate-300 bg-slate-50 text-slate-900 focus:border-indigo-500 focus:bg-white"}`}
                  value={equation}
                  onChange={(e) => setEquation(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleGenerateEquation();
                    }
                  }}
                />
                <button
                  className="w-full rounded-sm bg-indigo-600 px-3 py-2 text-[15px] cursor-pointer font-medium text-white transition hover:bg-indigo-500"
                  onClick={handleGenerateEquation}
                >
                  Generate Graph
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
            </div>
          </div>

          {/* Footer */}
          {isSidebarOpen && (
            <div className={`flex items-center justify-center gap-2 border-t px-4 py-2 text-center text-xs font-light transition-colors duration-300 sm:px-5 ${isDarkMode ? "border-slate-800 bg-slate-900/80 text-slate-500" : "border-slate-200 bg-slate-100/50 text-slate-400 rounded-b"}`}>
              <span>© 2026</span>
              <div className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
                <Logo size={18} />
                <span className="font-medium">wolgwang</span>
              </div>
              <span>. Built with ♥</span>
            </div>
          )}
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
