import type { PracticeExample } from "@/lib/graph-types";

export const PRACTICE_EXAMPLES: PracticeExample[] = [
  {
    id: "mul-after-add",
    title: "Multiply after add",
    description:
      "A classic micrograd example: q = x + y, then f = q × z. Run backprop and compare the gradients to the diagram.",
    nodes: [
      { id: "x", kind: "input", label: "x", value: -2, position: { x: 0, y: 0 } },
      { id: "y", kind: "input", label: "y", value: 5, position: { x: 0, y: 100 } },
      { id: "z", kind: "input", label: "z", value: -4, position: { x: 0, y: 220 } },
      { id: "q", kind: "operation", label: "q", op: "add", position: { x: 180, y: 50 } },
      { id: "f", kind: "operation", label: "f", op: "mul", position: { x: 340, y: 130 } },
      { id: "out", kind: "output", label: "output", position: { x: 500, y: 130 } },
    ],
    edges: [
      { id: "x-q", source: "x", target: "q", targetHandle: "a" },
      { id: "y-q", source: "y", target: "q", targetHandle: "b" },
      { id: "q-f", source: "q", target: "f", targetHandle: "a" },
      { id: "z-f", source: "z", target: "f", targetHandle: "b" },
      { id: "f-out", source: "f", target: "out", targetHandle: "in" },
    ],
  },
  {
    id: "relu-chain",
    title: "ReLU gate",
    description:
      "Combine a linear term and a gate: q = a × b, r = q + c, f = ReLU(r). This is useful for seeing how gradients stop at inactive neurons.",
    nodes: [
      { id: "a", kind: "input", label: "a", value: 2, position: { x: 0, y: 0 } },
      { id: "b", kind: "input", label: "b", value: -3, position: { x: 0, y: 100 } },
      { id: "c", kind: "input", label: "c", value: 4, position: { x: 0, y: 220 } },
      { id: "q2", kind: "operation", label: "q", op: "mul", position: { x: 180, y: 50 } },
      { id: "r2", kind: "operation", label: "r", op: "add", position: { x: 340, y: 120 } },
      { id: "f2", kind: "operation", label: "f", op: "relu", position: { x: 500, y: 120 } },
      { id: "out2", kind: "output", label: "output", position: { x: 660, y: 120 } },
    ],
    edges: [
      { id: "a-q2", source: "a", target: "q2", targetHandle: "a" },
      { id: "b-q2", source: "b", target: "q2", targetHandle: "b" },
      { id: "q2-r2", source: "q2", target: "r2", targetHandle: "a" },
      { id: "c-r2", source: "c", target: "r2", targetHandle: "b" },
      { id: "r2-f2", source: "r2", target: "f2", targetHandle: "a" },
      { id: "f2-out2", source: "f2", target: "out2", targetHandle: "in" },
    ],
  },
  {
    id: "tanh-sigmoid",
    title: "Nonlinear stack",
    description:
      "Explore chained nonlinearities with q = tanh(x + y) and f = sigmoid(q). Small changes here make gradient saturation easy to see.",
    nodes: [
      { id: "x3", kind: "input", label: "x", value: 1.25, position: { x: 0, y: 20 } },
      { id: "y3", kind: "input", label: "y", value: -0.5, position: { x: 0, y: 130 } },
      { id: "sum3", kind: "operation", label: "sum", op: "add", position: { x: 180, y: 70 } },
      { id: "tanh3", kind: "operation", label: "q", op: "tanh", position: { x: 340, y: 70 } },
      { id: "sig3", kind: "operation", label: "f", op: "sigmoid", position: { x: 500, y: 70 } },
      { id: "out3", kind: "output", label: "output", position: { x: 660, y: 70 } },
    ],
    edges: [
      { id: "x3-sum3", source: "x3", target: "sum3", targetHandle: "a" },
      { id: "y3-sum3", source: "y3", target: "sum3", targetHandle: "b" },
      { id: "sum3-tanh3", source: "sum3", target: "tanh3", targetHandle: "a" },
      { id: "tanh3-sig3", source: "tanh3", target: "sig3", targetHandle: "a" },
      { id: "sig3-out3", source: "sig3", target: "out3", targetHandle: "in" },
    ],
  },
];
