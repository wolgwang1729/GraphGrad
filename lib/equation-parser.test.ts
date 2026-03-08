import { describe, it, expect } from "vitest";
import { parseEquationToGraph } from "./equation-parser";
import { OperationNodeSpec, InputNodeSpec } from "./graph-types";

describe("parseEquationToGraph", () => {
  it("should parse a simple addition: x + y", () => {
    const { nodes, edges } = parseEquationToGraph("x + y");
    
    const inputX = nodes.find(n => n.id === "input-x-2") as InputNodeSpec;
    const inputY = nodes.find(n => n.id === "input-y-3") as InputNodeSpec;
    const opAdd = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "add") as OperationNodeSpec;
    const output = nodes.find(n => n.kind === "output");

    expect(inputX).toBeDefined();
    expect(inputY).toBeDefined();
    expect(opAdd).toBeDefined();
    expect(output).toBeDefined();

    // Check edges
    expect(edges).toContainEqual(expect.objectContaining({ source: inputX?.id, target: opAdd?.id }));
    expect(edges).toContainEqual(expect.objectContaining({ source: inputY?.id, target: opAdd?.id }));
    expect(edges).toContainEqual(expect.objectContaining({ source: opAdd?.id, target: output?.id }));
  });

  it("should parse a simple multiplication: 2 * x", () => {
    const { nodes } = parseEquationToGraph("2 * x");
    const inputConst = nodes.find(n => n.label === "2") as InputNodeSpec;
    const inputX = nodes.find(n => n.label === "x") as InputNodeSpec;
    const opMul = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "mul") as OperationNodeSpec;

    expect(inputConst).toBeDefined();
    expect(inputX).toBeDefined();
    expect(opMul).toBeDefined();
    expect(inputConst?.value).toBe(2);
  });

  it("should handle exponents: x^2", () => {
    const { nodes } = parseEquationToGraph("x^2");
    const opPow = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "pow") as OperationNodeSpec;
    
    expect(opPow).toBeDefined();
    expect(opPow?.parameter).toBe(2);
  });

  it("should handle functions: log(x)", () => {
    const { nodes } = parseEquationToGraph("log(x)");
    const opLog = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "log") as OperationNodeSpec;
    
    expect(opLog).toBeDefined();
  });

  it("should handle ln alias: ln(x)", () => {
    const { nodes } = parseEquationToGraph("ln(x)");
    const opLog = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "log") as OperationNodeSpec;
    
    expect(opLog).toBeDefined();
  });

  it("should handle nested expressions: (x + y) * 2", () => {
    const { nodes, edges } = parseEquationToGraph("(x + y) * 2");
    const opAdd = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "add") as OperationNodeSpec;
    const opMul = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "mul") as OperationNodeSpec;

    expect(opAdd).toBeDefined();
    expect(opMul).toBeDefined();

    // Edge from add to mul
    expect(edges).toContainEqual(expect.objectContaining({ source: opAdd?.id, target: opMul?.id }));
  });

  it("should handle unary minus: -x", () => {
    const { nodes } = parseEquationToGraph("-x");
    const opNeg = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "neg") as OperationNodeSpec;
    expect(opNeg).toBeDefined();
  });

  it("should throw error for unsupported operations", () => {
    expect(() => parseEquationToGraph("unknownFunc(x)")).toThrow("Unsupported operation");
  });

  it("should correctly layout nodes with unique positions", () => {
    const { nodes } = parseEquationToGraph("x + y");
    const positions = nodes.map(n => JSON.stringify(n.position));
    const uniquePositions = new Set(positions);
    
    // Each node should have a unique position in this simple graph
    expect(uniquePositions.size).toBe(nodes.length);
    nodes.forEach(n => {
        expect(n.position.x).toBeDefined();
        expect(n.position.y).toBeDefined();
    });
  });
});
