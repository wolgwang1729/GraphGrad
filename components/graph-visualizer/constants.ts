import type { SupportedOperation } from "@/lib/graph-types";

import type { StatusState } from "./types";

export const DEFAULT_OPERATION: SupportedOperation = "add";

export const DEFAULT_STATUS: StatusState = {
  tone: "info",
  text: "Load an example, tweak values, connect nodes, then run forward or backward.",
};

export const EDGE_BASE_STYLE = { stroke: "#94a3b8", strokeWidth: 1.5 };
export const DRAGGING_EDGE_STYLE = {
  stroke: "#94a3b8",
  strokeWidth: 1.5,
  strokeDasharray: "4 4",
  markerEnd: "url(#graphgrad-edge-arrow-active)",
};
export const EDGE_TARGET_GAP_PX = -4;
export const STRAIGHT_EDGE_TARGET_GAP_PX = -2;

export const FIT_VIEW_PADDING = 0.2;
export const SIDEBAR_RESERVED_WIDTH_PX = 430;
export const SIDEBAR_COLLAPSED_RESERVED_WIDTH_PX = 0;
export const MOBILE_BREAKPOINT_PX = 640;
export const MOBILE_SIDEBAR_LEFT_OFFSET_PX = 10;
export const MOBILE_SIDEBAR_RIGHT_GAP_PX = 64;
export const MOBILE_SIDEBAR_MIN_WIDTH_PX = 256;
export const MOBILE_SIDEBAR_MAX_WIDTH_PX = 320;

export const TOOLBAR_THRESHOLD_PX = 150;

export const OPERATION_MATH_LABELS: Record<SupportedOperation, string> = {
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
