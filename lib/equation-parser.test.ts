import { describe, it, expect } from "vitest";
import { parseEquationToGraph } from "./equation-parser";
import { OperationNodeSpec, InputNodeSpec } from "./graph-types";

describe("parseEquationToGraph", () => {
  it("should parse a simple addition: x + y", () => {
    const { nodes, edges } = parseEquationToGraph("x + y");
    
    const inputX = nodes.find(n => n.label === "x") as InputNodeSpec;
    const inputY = nodes.find(n => n.label === "y") as InputNodeSpec;
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

  it("should normalize plain trailing digits to subscripts: x2 + y2", () => {
    const { nodes } = parseEquationToGraph("x2 + y2");

    const inputX2 = nodes.find((n) => n.kind === "input" && n.label === "x_2") as InputNodeSpec;
    const inputY2 = nodes.find((n) => n.kind === "input" && n.label === "y_2") as InputNodeSpec;

    expect(inputX2).toBeDefined();
    expect(inputY2).toBeDefined();
  });

  it("should normalize lowercase multi-digit suffixes to subscripts: x23 + y24", () => {
    const { nodes } = parseEquationToGraph("x23 + y24");

    const inputX23 = nodes.find((n) => n.kind === "input" && n.label === "x_23") as InputNodeSpec;
    const inputY24 = nodes.find((n) => n.kind === "input" && n.label === "y_24") as InputNodeSpec;

    expect(inputX23).toBeDefined();
    expect(inputY24).toBeDefined();
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

  // --- New Tests ---

  it("should parse subtraction: x - y", () => {
    const { nodes, edges } = parseEquationToGraph("x - y");
    const opSub = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "sub") as OperationNodeSpec;
    expect(opSub).toBeDefined();
    // Both inputs should connect to the sub node
    const inputX = nodes.find(n => n.label === "x");
    const inputY = nodes.find(n => n.label === "y");
    expect(edges.some(e => e.source === inputX?.id && e.target === opSub?.id)).toBe(true);
    expect(edges.some(e => e.source === inputY?.id && e.target === opSub?.id)).toBe(true);
  });

  it("should parse division: x / y", () => {
    const { nodes } = parseEquationToGraph("x / y");
    const opDiv = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "div") as OperationNodeSpec;
    expect(opDiv).toBeDefined();
  });

  it("should parse exp function: exp(x)", () => {
    const { nodes } = parseEquationToGraph("exp(x)");
    const opExp = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "exp") as OperationNodeSpec;
    expect(opExp).toBeDefined();
  });

  it("should parse tanh function: tanh(x)", () => {
    const { nodes } = parseEquationToGraph("tanh(x)");
    const opTanh = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "tanh") as OperationNodeSpec;
    expect(opTanh).toBeDefined();
  });

  it("should parse sigmoid function: sigmoid(x)", () => {
    const { nodes } = parseEquationToGraph("sigmoid(x)");
    const opSigmoid = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "sigmoid") as OperationNodeSpec;
    expect(opSigmoid).toBeDefined();
  });

  it("should parse relu function: relu(x)", () => {
    const { nodes } = parseEquationToGraph("relu(x)");
    const opRelu = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "relu") as OperationNodeSpec;
    expect(opRelu).toBeDefined();
  });

  it("should parse max function: max(x, y)", () => {
    const { nodes, edges } = parseEquationToGraph("max(x, y)");
    const opMax = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "max") as OperationNodeSpec;
    expect(opMax).toBeDefined();
    // max is binary – should have two input edges
    const edgesToMax = edges.filter(e => e.target === opMax?.id);
    expect(edgesToMax.length).toBe(2);
  });

  it("should reuse the same input node when a variable appears twice: x + x", () => {
    const { nodes } = parseEquationToGraph("x + x");
    const xNodes = nodes.filter(n => n.kind === "input" && n.label === "x");
    // Should only create one 'x' input node
    expect(xNodes.length).toBe(1);
  });

  it("should handle fractional exponents: x^0.5", () => {
    const { nodes } = parseEquationToGraph("x^0.5");
    const opPow = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "pow") as OperationNodeSpec;
    expect(opPow).toBeDefined();
    expect(opPow?.parameter).toBeCloseTo(0.5);
  });

  it("should throw an error when exponent is not a constant: x^y", () => {
    // Current implementation throws "Exponent must be a constant number in this visualizer."
    expect(() => parseEquationToGraph("x^y")).toThrow(/constant number/);
  });

  it("should sanitize unicode operators (∗ for *): x ∗ y", () => {
    const { nodes } = parseEquationToGraph("x ∗ y");
    const opMul = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "mul") as OperationNodeSpec;
    expect(opMul).toBeDefined();
  });

  it("should sanitize unicode minus (−): x − y", () => {
    const { nodes } = parseEquationToGraph("x − y");
    const opSub = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "sub") as OperationNodeSpec;
    expect(opSub).toBeDefined();
  });

  it("should always produce exactly one output node", () => {
    const equations = ["x + y", "x^2", "exp(x)", "x * y + 1"];
    equations.forEach(eq => {
      const { nodes } = parseEquationToGraph(eq);
      const outputNodes = nodes.filter(n => n.kind === "output");
      expect(outputNodes.length).toBe(1);
    });
  });

  it("should use targetHandle 'a' and 'b' for binary operation inputs", () => {
    const { nodes, edges } = parseEquationToGraph("x + y");
    const opAdd = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "add") as OperationNodeSpec;
    const edgesToAdd = edges.filter(e => e.target === opAdd?.id);
    const handles = edgesToAdd.map(e => e.targetHandle);
    expect(handles).toContain("a");
    expect(handles).toContain("b");
  });

  it("should use targetHandle 'a' for unary operation inputs", () => {
    const { nodes, edges } = parseEquationToGraph("exp(x)");
    const opExp = nodes.find(n => n.kind === "operation" && (n as OperationNodeSpec).op === "exp") as OperationNodeSpec;
    const edgeToExp = edges.find(e => e.target === opExp?.id);
    expect(edgeToExp?.targetHandle).toBe("a");
  });
});
