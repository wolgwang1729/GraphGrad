"use client";

import "@xyflow/react/dist/style.css";
import "katex/dist/katex.min.css";

import {
  addEdge,
  Background,
  ControlButton,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  getViewportForBounds,
  type Connection,
  type EdgeChange,
  type NodeChange,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { COMPUTATION_EXAMPLES } from "@/lib/examples";
import { parseEquationToGraph } from "@/lib/equation-parser";
import { evaluateGraph, type EvaluationMode } from "@/lib/graph-evaluator";
import {
  getOperationArity,
  type GraphNodeKind,
  OPERATION_LABELS,
  type ComputationExample,
  type SupportedOperation,
} from "@/lib/graph-types";
import { Logo } from "./logo";

import {
  DEFAULT_OPERATION,
  DEFAULT_STATUS,
  DRAGGING_EDGE_STYLE,
  FIT_VIEW_PADDING,
  OPERATION_MATH_LABELS,
} from "./graph-visualizer/constants";
import { GraphEditorContext } from "./graph-visualizer/context";
import { EdgeMarkers, edgeTypes } from "./graph-visualizer/edge";
import { nodeTypes } from "./graph-visualizer/nodes";
import { ToneBanner } from "./graph-visualizer/status-banner";
import type {
  EditorContextValue,
  EditorEdge,
  EditorNode,
  StatusState,
} from "./graph-visualizer/types";
import {
  decorateEdge,
  getDefaultPosition,
  getErrorMessage,
  getNextInputLabel,
  getSidebarReservedWidth,
  makeNodeId,
  normalizeMathSubscripts,
  resetNodeMetrics,
  serializeEdges,
  serializeNodes,
  toEditorEdge,
  toEditorNode,
} from "./graph-visualizer/utils";

type MobilePanel = "graph" | "evaluation" | "equation" | "legend" | null;

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
  const [activeMobilePanel, setActiveMobilePanel] = useState<MobilePanel>(null);

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

  useEffect(() => {
    let rafId: number | null = null;

    const handleResize = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }

      rafId = window.requestAnimationFrame(() => {
        fitGraphToVisibleArea(120);
      });
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }

      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [fitGraphToVisibleArea]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 640) {
        setActiveMobilePanel(null);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

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

      let displayEq = normalizeMathSubscripts(equation);
      const replacements: Record<string, string> = {
        ...OPERATION_MATH_LABELS,
        ln: "\\operatorname{ln}",
        multiply: "\\times",
        divide: "\\div",
        subtract: "-",
        add: "+",
      };

      const sortedKeys = Object.keys(replacements).sort((a, b) => b.length - a.length);

      for (const key of sortedKeys) {
        const mathLabel = replacements[key];
        const regex = new RegExp(`\\b${key}\\b`, "gi");
        displayEq = displayEq.replace(regex, mathLabel);
      }

      setStatus({
        tone: "success",
        text: `Successfully generated graph for: $$${displayEq}$$`,
      });

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          fitGraphToVisibleArea(400);
        });
      });
    } catch (err: unknown) {
      setStatus({ tone: "error", text: `Error generating graph: ${getErrorMessage(err)}` });
    }
  }, [equation, fitGraphToVisibleArea, setEdges, setNodes]);

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
            <Controls position="bottom-right" showFitView={false} showInteractive={false} className="bottom-[calc(env(safe-area-inset-bottom,0px)+4.75rem)]! sm:bottom-4!">
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
                    transition: "all 0.2s ease-in-out",
                  }}
                >
                  <rect
                    x="5"
                    y="11"
                    width="14"
                    height="10"
                    rx="2"
                    ry="2"
                    fill="currentColor"
                    fillOpacity={isLocked ? 0.2 : 0}
                    style={{ transition: "fill-opacity 0.2s ease" }}
                  ></rect>
                  <path
                    d={isLocked ? "M8 11V7a4 4 0 0 1 8 0v4" : "M8 11V5a4 4 0 0 1 8 0"}
                    style={{ transition: "d 0.2s ease" }}
                  ></path>
                  <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"></circle>
                  <path d="M11.3 15.5 L10.4 18.5 L13.6 18.5 L12.7 15.5 Z" fill="currentColor" stroke="none"></path>
                </svg>
              </ControlButton>
            </Controls>
            <Background gap={20} size={1} color={isDarkMode ? "rgba(148, 163, 184, 0.08)" : "rgba(148, 163, 184, 0.2)"} />
          </ReactFlow>
        </main>

        <div className={`absolute top-2.5 left-2.5 right-2.5 z-30 flex items-center justify-between rounded border px-3 py-2 transition-colors duration-300 sm:hidden ${isDarkMode ? "border-slate-800 bg-slate-950 text-white" : "border-slate-200 bg-slate-50 text-slate-800"}`}>
          <div className="flex flex-col">
            <h1 className="text-[1.6rem] leading-none font-thin tracking-wide">GraphGrad</h1>
            <p className={`text-xs font-light ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>Computation Graph Visualizer</p>
          </div>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border transition-colors ${isDarkMode
              ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            aria-label="Toggle Theme"
          >
            {isDarkMode ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
            )}
          </button>
        </div>

        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className={`absolute top-3 right-3 z-30 hidden h-10 w-10 cursor-pointer items-center justify-center rounded-full border shadow-lg transition-colors sm:top-4 sm:right-5 sm:flex ${isDarkMode
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

        <div className={`absolute top-2.5 left-2.5 right-16 z-20 hidden max-h-[calc(100dvh-20px)] w-auto min-w-64 max-w-[20rem] flex-col rounded border transition-colors duration-300 sm:right-auto sm:flex sm:max-h-[calc(100dvh-60px)] sm:w-88 sm:max-w-none lg:w-102.5 ${isDarkMode ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"}`}>
          <div className={`border-b px-4 pt-4 pb-0 transition-colors duration-300 sm:px-5 ${isDarkMode ? "border-slate-800 bg-slate-900/80 text-white" : "border-slate-200 bg-slate-100/50 text-slate-800 rounded-t"}`}>
            <button
              className={`float-right cursor-pointer text-2xl transition-transform ${isDarkMode ? "text-slate-400 hover:text-white" : "text-slate-400 hover:text-slate-900"}`}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{ transform: isSidebarOpen ? "rotate(0deg)" : "rotate(-180deg)" }}
              aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </button>
            <h1 className="mb-1 pr-10 text-[2rem] font-thin leading-none tracking-wide sm:text-[2.5rem]">GraphGrad</h1>
            <p className={`mb-4 text-[15px] font-light ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>Computation Graph Visualizer</p>
            <nav className={`flex translate-y-px space-x-1 border-b ${isDarkMode ? "border-slate-700" : "border-slate-200"}`}></nav>
          </div>

          <div className={`overflow-y-auto p-4 transition-all sm:p-5 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full ${isDarkMode ? "[&::-webkit-scrollbar-thumb]:bg-slate-600" : "[&::-webkit-scrollbar-thumb]:bg-slate-300"} ${isSidebarOpen ? "block" : "hidden"}`}>
            <ToneBanner status={status} />
            <hr className={`my-3 ${isDarkMode ? "border-slate-700" : "border-slate-200"}`} />

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

            <div>
              <h4 className={`mb-3 text-lg font-light ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>Nodes:</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button className="rounded-sm bg-indigo-600 px-3 py-1.5 text-[15px] cursor-pointer text-white transition hover:bg-indigo-500" onClick={() => addNode("input")}>+ Input</button>
                <button className="rounded-sm bg-indigo-600 px-3 py-1.5 text-[15px] cursor-pointer text-white transition hover:bg-indigo-500" onClick={() => addNode("operation")}>+ Op</button>
                <span className="w-full" title={hasOutputNode ? "There can be only one out node." : "Add an output node."}>
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

            <div>
              <h4 className={`mb-3 text-lg font-light ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>Evaluation:</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button className="rounded-sm bg-indigo-600 px-3 py-1.5 text-[15px] cursor-pointer text-white transition hover:bg-indigo-500" onClick={() => runEvaluation("forward")}>Forward</button>
                <button className="rounded-sm bg-indigo-600 px-3 py-1.5 text-[15px] cursor-pointer text-white transition hover:bg-indigo-500" onClick={() => runEvaluation("backward")}>Backprop</button>
                <button className={`rounded-sm border px-3 py-1.5 text-[15px] cursor-pointer transition bg-transparent ${isDarkMode ? "border-slate-600 text-slate-300 hover:border-red-500 hover:text-red-500" : "border-slate-300 text-slate-600 hover:border-red-500 hover:text-red-500"}`} onClick={() => resetComputedState()}>Clear Values</button>
                <button className={`rounded-sm border px-3 py-1.5 text-[15px] cursor-pointer transition bg-transparent ${isDarkMode
                    ? "border-red-500/30 text-red-400/80 hover:bg-red-500 hover:text-white hover:border-red-500"
                    : "border-red-200 text-red-600/80 hover:bg-red-500 hover:text-white hover:border-red-500"
                    }`} onClick={() => clearCanvas()}>Clear Canvas</button>
              </div>
            </div>

            <hr className={`my-3 ${isDarkMode ? "border-slate-700" : "border-slate-200"}`} />

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
                <button className="w-full rounded-sm bg-indigo-600 px-3 py-2 text-[15px] cursor-pointer font-medium text-white transition hover:bg-indigo-500" onClick={handleGenerateEquation}>Generate Graph</button>
              </div>
            </div>

            <hr className={`my-3 ${isDarkMode ? "border-slate-700" : "border-slate-200"}`} />

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

        <div className="absolute inset-x-0 bottom-0 z-30 sm:hidden">
          {activeMobilePanel && (
            <div className={`mx-2 mb-2 max-h-[56dvh] overflow-y-auto rounded border p-3 transition-colors duration-300 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full ${isDarkMode ? "border-slate-800 bg-slate-950 text-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-600" : "border-slate-200 bg-slate-50 text-slate-800 [&::-webkit-scrollbar-thumb]:bg-slate-300"}`}>
              {activeMobilePanel === "graph" && (
                <div>
                  <ToneBanner status={status} />
                  <hr className={`my-3 ${isDarkMode ? "border-slate-700" : "border-slate-200"}`} />
                  <div>
                    <h4 className={`mb-2 text-base font-light ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>Examples</h4>
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
                  <div>
                    <h4 className={`mb-2 text-base font-light ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>Nodes</h4>
                    <div className="grid grid-cols-3 gap-2">
                      <button className="rounded-sm bg-indigo-600 px-2 py-1.5 text-sm cursor-pointer text-white transition hover:bg-indigo-500" onClick={() => addNode("input")}>+ Input</button>
                      <button className="rounded-sm bg-indigo-600 px-2 py-1.5 text-sm cursor-pointer text-white transition hover:bg-indigo-500" onClick={() => addNode("operation")}>+ Op</button>
                      <button
                        className="rounded-sm bg-indigo-600 px-2 py-1.5 text-sm cursor-pointer text-white transition hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => addNode("output")}
                        disabled={hasOutputNode}
                        aria-label={hasOutputNode ? "There can be only one out node" : "Add an output node"}
                      >
                        + Out
                      </button>
                    </div>
                  </div>
                  <hr className={`my-3 ${isDarkMode ? "border-slate-700" : "border-slate-200"}`} />
                  <button className={`w-full rounded-sm border px-3 py-2 text-sm cursor-pointer transition bg-transparent ${isDarkMode
                    ? "border-red-500/30 text-red-400/80 hover:bg-red-500 hover:text-white hover:border-red-500"
                    : "border-red-200 text-red-600/80 hover:bg-red-500 hover:text-white hover:border-red-500"
                    }`} onClick={() => clearCanvas()}>Clear Canvas</button>
                </div>
              )}

              {activeMobilePanel === "evaluation" && (
                <div>
                  <h4 className={`mb-2 text-[15px] font-light ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>Evaluation</h4>
                  <div className="grid grid-cols-2 gap-2">
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
                      className={`col-span-2 rounded-sm border px-3 py-1.5 text-[15px] cursor-pointer transition bg-transparent ${isDarkMode ? "border-slate-600 text-slate-300 hover:border-red-500 hover:text-red-500" : "border-slate-300 text-slate-600 hover:border-red-500 hover:text-red-500"}`}
                      onClick={() => resetComputedState()}
                    >
                      Clear Values
                    </button>
                  </div>
                </div>
              )}

              {activeMobilePanel === "equation" && (
                <div>
                  <h4 className={`mb-3 text-base font-light ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>Equation to Graph</h4>
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="e.g. x + y * 2"
                      className={`w-full rounded border px-3 py-2 text-sm font-mono outline-none ${isDarkMode ? "border-slate-600 bg-slate-900 text-slate-100 focus:border-indigo-500" : "border-slate-300 bg-slate-50 text-slate-900 focus:border-indigo-500 focus:bg-white"}`}
                      value={equation}
                      onChange={(e) => setEquation(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleGenerateEquation();
                        }
                      }}
                    />
                    <button className="w-full rounded-sm bg-indigo-600 px-3 py-2 text-sm cursor-pointer font-medium text-white transition hover:bg-indigo-500" onClick={handleGenerateEquation}>Generate Graph</button>
                  </div>
                </div>
              )}

              {activeMobilePanel === "legend" && (
                <div>
                  <h4 className={`mb-2 text-base font-light ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>Legend</h4>
                  <div className={`space-y-2 text-sm ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
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
              )}
            </div>
          )}

          <div className={`mx-2 mb-2 grid grid-cols-4 rounded border p-1 transition-colors duration-300 ${isDarkMode ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"}`}>
            {[
              { id: "graph" as const, label: "Graph" },
              { id: "evaluation" as const, label: "Evaluation" },
              { id: "equation" as const, label: "Equation" },
              { id: "legend" as const, label: "Legend" },
            ].map((item) => {
              const isActive = activeMobilePanel === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveMobilePanel(isActive ? null : item.id)}
                  className={`rounded px-2 py-2 text-xs font-light transition-colors ${isActive
                    ? "bg-indigo-600 text-white"
                    : isDarkMode
                      ? "text-slate-300 hover:bg-slate-800"
                      : "text-slate-700 hover:bg-slate-200"
                    }`}
                >
                  {item.label}
                </button>
              );
            })}
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
