import {
  BaseEdge,
  EdgeLabelRenderer,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  useNodesData,
} from "@xyflow/react";
import { InlineMath } from "react-katex";

import {
  EDGE_BASE_STYLE,
  EDGE_TARGET_GAP_PX,
  STRAIGHT_EDGE_TARGET_GAP_PX,
} from "./constants";
import type { EditorNode, LabeledEdgeData } from "./types";
import { formatNumber } from "./utils";

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
  const strokeColor =
    typeof style?.stroke === "string" ? style.stroke : EDGE_BASE_STYLE.stroke;
  const markerEnd =
    strokeColor === "#475569"
      ? "url(#graphgrad-edge-arrow-muted)"
      : "url(#graphgrad-edge-arrow-active)";
  const isStraight = Math.abs(sourceY - targetY) < 1.5;
  const targetGap = isStraight ? STRAIGHT_EDGE_TARGET_GAP_PX : EDGE_TARGET_GAP_PX;

  function getShortenedTargetPoint(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ) {
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

export const edgeTypes: EdgeTypes = {
  labeledEdge: LabeledEdge,
};

export function EdgeMarkers() {
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

export type { LabeledEdgeData };
