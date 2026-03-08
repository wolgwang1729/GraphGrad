export type SupportedOperation =
  | "add"
  | "mul"
  | "sub"
  | "div"
  | "pow"
  | "neg"
  | "relu"
  | "tanh"
  | "exp"
  | "sigmoid";

export type GraphNodeKind = "input" | "operation" | "output";

export type XYPosition = {
  x: number;
  y: number;
};

export type InputNodeSpec = {
  id: string;
  kind: "input";
  label: string;
  value: number;
  position: XYPosition;
};

export type OperationNodeSpec = {
  id: string;
  kind: "operation";
  label: string;
  op: SupportedOperation;
  position: XYPosition;
  parameter?: number;
};

export type OutputNodeSpec = {
  id: string;
  kind: "output";
  label: string;
  position: XYPosition;
};

export type GraphNodeSpec = InputNodeSpec | OperationNodeSpec | OutputNodeSpec;

export type GraphEdgeSpec = {
  id: string;
  source: string;
  target: string;
  targetHandle?: string | null;
};

export type PracticeExample = {
  id: string;
  title: string;
  description: string;
  nodes: GraphNodeSpec[];
  edges: GraphEdgeSpec[];
};

export const UNARY_OPERATIONS: SupportedOperation[] = [
  "pow",
  "neg",
  "relu",
  "tanh",
  "exp",
  "sigmoid",
];

export const BINARY_OPERATIONS: SupportedOperation[] = ["add", "mul", "sub", "div"];

export const OPERATION_LABELS: Record<SupportedOperation, string> = {
  add: "+",
  mul: "×",
  sub: "−",
  div: "÷",
  pow: "pow",
  neg: "neg",
  relu: "ReLU",
  tanh: "tanh",
  exp: "exp",
  sigmoid: "sigmoid",
};

export function isUnaryOperation(op: SupportedOperation): boolean {
  return UNARY_OPERATIONS.includes(op);
}

export function getOperationArity(op: SupportedOperation): 1 | 2 {
  return isUnaryOperation(op) ? 1 : 2;
}
