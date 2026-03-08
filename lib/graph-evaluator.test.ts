import { describe, it, expect } from "vitest";
import { evaluateGraph } from "./graph-evaluator";
import { GraphNodeSpec, GraphEdgeSpec } from "./graph-types";

describe("evaluateGraph", () => {
  it("should evaluate a simple forward pass: x + y", () => {
    const nodes: GraphNodeSpec[] = [
      { id: "x", kind: "input", label: "x", value: 3, position: { x: 0, y: 0 } },
      { id: "y", kind: "input", label: "y", value: 4, position: { x: 0, y: 100 } },
      { id: "add1", kind: "operation", op: "add", label: "add", position: { x: 100, y: 50 } },
      { id: "out", kind: "output", label: "output", position: { x: 200, y: 50 } }
    ];

    const edges: GraphEdgeSpec[] = [
      { id: "e1", source: "x", target: "add1", targetHandle: "a" },
      { id: "e2", source: "y", target: "add1", targetHandle: "b" },
      { id: "e3", source: "add1", target: "out", targetHandle: "in" }
    ];

    const result = evaluateGraph(nodes, edges, "forward");

    expect(result.ok).toBe(true);
    if (!result.ok) return; // Type guard

    // Check values
    expect(result.nodeResults["x"].value).toBe(3);
    expect(result.nodeResults["y"].value).toBe(4);
    expect(result.nodeResults["add1"].value).toBe(7);
    expect(result.nodeResults["out"].value).toBe(7);

    // In forward mode, grads should be zero (except output which isn't backpropped yet)
    expect(result.nodeResults["x"].grad).toBe(0);
  });

  it("should evaluate a backward pass and assign gradients: x * y", () => {
    const nodes: GraphNodeSpec[] = [
      { id: "x", kind: "input", label: "x", value: 2, position: { x: 0, y: 0 } },
      { id: "y", kind: "input", label: "y", value: -3, position: { x: 0, y: 100 } },
      { id: "mul1", kind: "operation", op: "mul", label: "mul", position: { x: 100, y: 50 } },
      { id: "out", kind: "output", label: "output", position: { x: 200, y: 50 } }
    ];

    const edges: GraphEdgeSpec[] = [
      { id: "e1", source: "x", target: "mul1", targetHandle: "a" },
      { id: "e2", source: "y", target: "mul1", targetHandle: "b" },
      { id: "e3", source: "mul1", target: "out", targetHandle: "in" }
    ];

    const result = evaluateGraph(nodes, edges, "backward");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Output = 2 * -3 = -6
    expect(result.nodeResults["out"].value).toBe(-6);
    
    // Gradients: dx = y (-3), dy = x (2)
    expect(result.nodeResults["out"].grad).toBe(1);
    expect(result.nodeResults["mul1"].grad).toBe(1);
    expect(result.nodeResults["x"].grad).toBe(-3);
    expect(result.nodeResults["y"].grad).toBe(2);
  });

  it("should fail gracefully if the graph has no output node", () => {
    const nodes: GraphNodeSpec[] = [
      { id: "x", kind: "input", label: "x", value: 2, position: { x: 0, y: 0 } },
    ];
    const result = evaluateGraph(nodes, [], "forward");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("Add an output node");
    }
  });

  it("should issue warnings for disconnected nodes", () => {
    const nodes: GraphNodeSpec[] = [
      { id: "x", kind: "input", label: "x", value: 2, position: { x: 0, y: 0 } },
      { id: "y", kind: "input", label: "y", value: 4, position: { x: 0, y: 0 } }, // Disconnected
      { id: "out", kind: "output", label: "out", position: { x: 100, y: 0 } },
    ];
    
    const edges: GraphEdgeSpec[] = [
      { id: "e1", source: "x", target: "out", targetHandle: "in" }
    ];

    const result = evaluateGraph(nodes, edges, "forward");
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toContain("currently disconnected");
    }
  });
});
