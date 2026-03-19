import {
  Handle,
  NodeToolbar,
  Position,
  type NodeProps,
  type NodeTypes,
  useEdges,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { InlineMath } from "react-katex";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import { getOperationArity, OPERATION_LABELS, type SupportedOperation } from "@/lib/graph-types";

import { DEFAULT_OPERATION } from "./constants";
import { useGraphEditor } from "./context";
import { useToolbarPosition, useTouchLongPress } from "./hooks";
import type {
  InputEditorNode,
  OperationEditorNode,
  OutputEditorNode,
} from "./types";
import {
  formatNumber,
  getOperationMathLabel,
  normalizeMathSubscripts,
} from "./utils";

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

function getTargetHandleStyle(
  isDarkMode: boolean,
  isConnected: boolean,
  isLocked: boolean,
): React.CSSProperties {
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

function getSourceHandleStyle(
  isDarkMode: boolean,
  isLocked: boolean,
): React.CSSProperties {
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
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalText(value.toString());
    }
  }, [isFocused, value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    if (/^-?\d*\.?\d*(\/\d*)?$/.test(text) || text === "") {
      setLocalText(text);

      if (
        text !== "" &&
        text !== "-" &&
        text !== "." &&
        text !== "-." &&
        !text.endsWith(".") &&
        !text.endsWith("/")
      ) {
        let num: number;
        if (text.includes("/")) {
          const parts = text.split("/");
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
      onFocus={() => setIsFocused(true)}
      onChange={handleChange}
      onBlur={() => {
        setIsFocused(false);
        let num: number;
        if (localText.includes("/")) {
          const parts = localText.split("/");
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
          if (localText.includes("/")) {
            setLocalText(localText);
          } else {
            setLocalText(num.toString());
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
    <div
      ref={containerRef}
      className="relative"
      onWheelCapture={(event) => {
        event.stopPropagation();
      }}
    >
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
          className={`absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30 max-h-48 overflow-y-auto overscroll-contain rounded border shadow-xl [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full ${isDarkMode
            ? "border-slate-700 bg-slate-900 [&::-webkit-scrollbar-track]:bg-slate-900 [&::-webkit-scrollbar-thumb]:bg-slate-700 hover:[&::-webkit-scrollbar-thumb]:bg-slate-600"
            : "border-slate-200 bg-white [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-300 hover:[&::-webkit-scrollbar-thumb]:bg-slate-400"
            }`}
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: isDarkMode ? "#475569 #0f172a" : "#cbd5e1 #f1f5f9",
          }}
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

const InputNode = memo(function InputNode({
  id,
  data,
  selected,
  dragging,
}: NodeProps<InputEditorNode>) {
  const editor = useGraphEditor();
  const nodeRef = useRef<HTMLDivElement>(null);
  const toolbarPos = useToolbarPosition(nodeRef);
  const [wasDragged, setWasDragged] = useState(false);
  const longPressHandlers = useTouchLongPress({
    enabled: !editor.isLocked,
    onLongPress: () => editor.requestDeleteNode(id),
  });

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
      onPointerDown={longPressHandlers.onPointerDown}
      onPointerMove={longPressHandlers.onPointerMove}
      onPointerUp={longPressHandlers.onPointerUp}
      onPointerCancel={longPressHandlers.onPointerCancel}
      onPointerLeave={longPressHandlers.onPointerLeave}
      onTouchStart={longPressHandlers.onTouchStart}
      onTouchMove={longPressHandlers.onTouchMove}
      onTouchEnd={longPressHandlers.onTouchEnd}
      onTouchCancel={longPressHandlers.onTouchCancel}
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
      <div style={{ height: 18 }} />
      <div style={{ ...getCircleStyle(editor.isDarkMode), borderColor: "#22c55e", background: editor.isDarkMode ? "#0f172a" : "#f0fdf4", color: editor.isDarkMode ? "#e2e8f0" : "#14532d" }}>
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
          <InlineMath math={normalizeMathSubscripts(data.label)} />
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

const OperationNode = memo(function OperationNode({
  id,
  data,
  selected,
  dragging,
}: NodeProps<OperationEditorNode>) {
  const editor = useGraphEditor();
  const edges = useEdges();
  const nodeRef = useRef<HTMLDivElement>(null);
  const toolbarPos = useToolbarPosition(nodeRef);
  const updateNodeInternals = useUpdateNodeInternals();
  const op = data.op ?? DEFAULT_OPERATION;
  const arity = getOperationArity(op);
  const mathStr = getOperationMathLabel(op, data.parameter);
  const [wasDragged, setWasDragged] = useState(false);
  const longPressHandlers = useTouchLongPress({
    enabled: !editor.isLocked,
    onLongPress: () => editor.requestDeleteNode(id),
  });

  useEffect(() => {
    if (dragging) setWasDragged(true);
  }, [dragging]);

  useEffect(() => {
    if (!selected) setWasDragged(false);
  }, [selected]);

  const isConnectedA = useMemo(
    () => edges.some((e) => e.target === id && e.targetHandle === "a"),
    [edges, id],
  );
  const isConnectedB = useMemo(
    () => edges.some((e) => e.target === id && e.targetHandle === "b"),
    [edges, id],
  );

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
      onPointerDown={longPressHandlers.onPointerDown}
      onPointerMove={longPressHandlers.onPointerMove}
      onPointerUp={longPressHandlers.onPointerUp}
      onPointerCancel={longPressHandlers.onPointerCancel}
      onPointerLeave={longPressHandlers.onPointerLeave}
      onTouchStart={longPressHandlers.onTouchStart}
      onTouchMove={longPressHandlers.onTouchMove}
      onTouchEnd={longPressHandlers.onTouchEnd}
      onTouchCancel={longPressHandlers.onTouchCancel}
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
          <InlineMath math={normalizeMathSubscripts(data.label)} />
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

const OutputNode = memo(function OutputNode({
  id,
  data,
  selected,
  dragging,
}: NodeProps<OutputEditorNode>) {
  const editor = useGraphEditor();
  const edges = useEdges();
  const nodeRef = useRef<HTMLDivElement>(null);
  const toolbarPos = useToolbarPosition(nodeRef);
  const [wasDragged, setWasDragged] = useState(false);
  const longPressHandlers = useTouchLongPress({
    enabled: !editor.isLocked,
    onLongPress: () => editor.requestDeleteNode(id),
  });

  useEffect(() => {
    if (dragging) setWasDragged(true);
  }, [dragging]);

  useEffect(() => {
    if (!selected) setWasDragged(false);
  }, [selected]);

  const isConnected = useMemo(
    () => edges.some((e) => e.target === id && e.targetHandle === "in"),
    [edges, id],
  );

  return (
    <div
      ref={nodeRef}
      style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
      onPointerDown={longPressHandlers.onPointerDown}
      onPointerMove={longPressHandlers.onPointerMove}
      onPointerUp={longPressHandlers.onPointerUp}
      onPointerCancel={longPressHandlers.onPointerCancel}
      onPointerLeave={longPressHandlers.onPointerLeave}
      onTouchStart={longPressHandlers.onTouchStart}
      onTouchMove={longPressHandlers.onTouchMove}
      onTouchEnd={longPressHandlers.onTouchEnd}
      onTouchCancel={longPressHandlers.onTouchCancel}
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
      <div style={{ height: 22 }} />
      <div style={{ ...getCircleStyle(editor.isDarkMode), borderColor: "#f59e0b", background: editor.isDarkMode ? "#0f172a" : "#fffbeb", color: editor.isDarkMode ? "#e2e8f0" : "#78350f", width: 36, height: 36 }}>
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
          <InlineMath math={normalizeMathSubscripts(data.label)} />
        </div>
        <span style={{ fontSize: 9 }}>●</span>
        <Handle
          type="target"
          id="in"
          position={Position.Left}
          isConnectable={!editor.isLocked}
          isConnectableStart={false}
          onPointerDown={() =>
            editor.showError(
              "You can't draw an arrow to the output of something. Start your connection from an output handle (right side) instead.",
            )
          }
          style={{ ...getTargetHandleStyle(editor.isDarkMode, isConnected, editor.isLocked), top: "50%" }}
        />
      </div>
    </div>
  );
});

export const nodeTypes: NodeTypes = {
  inputNode: InputNode,
  operationNode: OperationNode,
  outputNode: OutputNode,
};
