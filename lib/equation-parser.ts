import * as math from "mathjs";
import {
  GraphNodeSpec,
  GraphEdgeSpec,
  SupportedOperation,
  isUnaryOperation,
  OPERATION_LABELS,
} from "./graph-types";

// Mapping from mathjs node/function names to our SupportedOperation
const OPERATION_MAP: Record<string, SupportedOperation> = {
  add: "add",
  multiply: "mul",
  subtract: "sub",
  divide: "div",
  pow: "pow",
  unaryminus: "neg",
  // Function names
  max: "max",
  ln: "log", // mathjs parses 'ln' as the function 'ln', map it to our internal 'log' op
  log: "log",
  exp: "exp",
  // Mathjs doesn't have relu, sigmoid, tanh built-in or named exactly this way usually,
  // but if they type it as a function like `relu(x)` we can map it.
  relu: "relu",
  sigmoid: "sigmoid",
  tanh: "tanh",
};

export function parseEquationToGraph(
  equation: string
): { nodes: GraphNodeSpec[]; edges: GraphEdgeSpec[] } {
  let idCounter = 1;
  const generateId = (prefix: string) => `${prefix}-${idCounter++}`;

  const nodes: GraphNodeSpec[] = [];
  const edges: GraphEdgeSpec[] = [];

  const sanitizedEquation = equation
    .replace(/[∗×]/g, "*")
    .replace(/−/g, "-")
    .replace(/÷/g, "/");

  const node = math.parse(sanitizedEquation);

  const inputNodesMap = new Map<string, string>(); // symName/val -> nodeId

  const HORIZONTAL_SPACING = 150;
  const VERTICAL_SPACING = 100;

  // We assign x, y during traversal, then normalize later
  type NodeWithPos = { id: string; x: number; y: number };

  const traverse = (mathNode: math.MathNode, depth: number, indexAtDepth: number): NodeWithPos => {
    const x = depth * HORIZONTAL_SPACING;
    const y = indexAtDepth * VERTICAL_SPACING;

    if (mathNode.type === "SymbolNode") {
      const symNode = mathNode as math.SymbolNode;
      let nodeId = inputNodesMap.get(symNode.name);
      if (!nodeId) {
        nodeId = generateId(`input-${symNode.name}`);
        inputNodesMap.set(symNode.name, nodeId);
        nodes.push({
          id: nodeId,
          kind: "input",
          label: symNode.name,
          value: 1, // Default value
          position: { x: 0, y: 0 }, // Will set later
        });
      }
      return { id: nodeId, x, y };
    } else if (mathNode.type === "ConstantNode") {
      const constNode = mathNode as math.ConstantNode;
      const valStr = String(constNode.value);
      let nodeId = inputNodesMap.get(valStr);
      if (!nodeId) {
        nodeId = generateId(`input-const`);
        inputNodesMap.set(valStr, nodeId);
        nodes.push({
          id: nodeId,
          kind: "input",
          label: valStr,
          value: Number(constNode.value),
          position: { x: 0, y: 0 },
        });
      }
      return { id: nodeId, x, y };
    } else if (mathNode.type === "OperatorNode" || mathNode.type === "FunctionNode") {
      let isUnary = false;
      let opName = "";
      let args: math.MathNode[] = [];

      if (mathNode.type === "OperatorNode") {
        const opNode = mathNode as math.OperatorNode;
        isUnary = opNode.isUnary();
        opName = opNode.op; // e.g. '+', '*'
        
        // Map op back to name since OPERATION_MAP uses names
        if (opName === '+') opName = 'add';
        else if (opName === '*') opName = 'multiply';
        else if (opName === '-') opName = isUnary ? 'unaryMinus' : 'subtract';
        else if (opName === '/') opName = 'divide';
        else if (opName === '^') opName = 'pow';
        
        args = opNode.args;
      } else {
        const fnNode = mathNode as math.FunctionNode;
        opName = fnNode.fn.name;
        args = fnNode.args;
      }

      const supportedOp = OPERATION_MAP[opName.toLowerCase()];
      if (!supportedOp) {
        throw new Error(`Unsupported operation: ${opName}`);
      }

      const nodeId = generateId(`op-${supportedOp}`);

      // Base spec
      const opSpec: GraphNodeSpec = {
        id: nodeId,
        kind: "operation",
        label: "",
        op: supportedOp,
        position: { x: 0, y: 0 },
      };

      // Traverse children. We place children further left (deeper).
      // Reversing args so first arg is at top (lower Y) might be visually better,
      // but let's just lay them out simply.
      const childNodes = args.map((arg, i) => traverse(arg, depth - 1, indexAtDepth * args.length + i - (args.length - 1)/2));

      // Special handling: if op is power and second arg is constant, we could use `parameter`
      // but standard approach is two inputs to `pow` operation.
      // Wait, graph-types says `pow` can have `parameter` if it's unary, or two inputs if we treat it as binary?
      // Actually `UNARY_OPERATIONS` includes `pow`! Meaning `pow` takes ONE input and a parameter.
      if (isUnaryOperation(supportedOp)) {
        if (supportedOp === "pow" && childNodes.length === 2 && args[1].type === "ConstantNode") {
           // It's a binary AST node, but our graph expects unary with parameter
           opSpec.parameter = Number((args[1] as math.ConstantNode).value);
           childNodes.pop(); // Remove the second child from linking
        } else if (supportedOp === "pow" && childNodes.length === 2) {
           // Our system only supports pow with a constant parameter, not another variable node!
           // But let's just put parameter = 2 as fallback and use only first child.
           // Ideally, user should type x^2.
           if (args[1].type !== "ConstantNode") {
              throw new Error("Exponent must be a constant number in this visualizer.");
           }
        }
      }

      nodes.push(opSpec);

      // Create edges
      childNodes.forEach((child, i) => {
        const arity = isUnaryOperation(supportedOp) ? 1 : 2;
        let targetHandle: string | undefined = undefined;
        if (arity === 1) {
          targetHandle = "a";
        } else {
          targetHandle = i === 0 ? "a" : "b";
        }

        edges.push({
          id: generateId(`e-${child.id}-${nodeId}`),
          source: child.id,
          target: nodeId,
          targetHandle,
        });
      });

      return { id: nodeId, x, y };

    } else if (mathNode.type === "ParenthesisNode") {
      const pNode = mathNode as math.ParenthesisNode;
      return traverse(pNode.content, depth, indexAtDepth);
    } else {
        throw new Error(`Unsupported equation part: ${mathNode.type}`);
    }
  };

  try {
    // Traverse from root, which is the final output
    // Put root at x=0. Inputs will be at negative x initially.
    const rootPos = traverse(node, 0, 0);

    // Add Output node
    const outputId = generateId(`output`);
    nodes.push({
      id: outputId,
      kind: "output",
      label: "\\text{out}",
      position: { x: (1) * HORIZONTAL_SPACING, y: 0 }, // Right of root
    });
    edges.push({
      id: generateId(`e-${rootPos.id}-${outputId}`),
      source: rootPos.id,
      target: outputId,
    });

    // Simple layout adjustment:
    // Move all nodes so minimum X is 100, minimum Y is 100
    // Currently, x is negative (depth is negative as we traverse back)
    
    // Assign calculated positions for tree layout
    const posMap = new Map<string, {x: number, y: number}>();
    
    // Recalculate positions purely topologically for better layout:
    // This is a simple fallback if the above isn't great, but let's stick to the computed x,y 
    // Wait, the traverse above didn't save the pos to the spec. Let's do that.
    
    // Actually, traverse was computing X and Y but not returning it easily for the nodes.
    // Let's rewrite the layout using standard DAG top-sort or just simple levels.
    
  } catch (error: any) {
    throw new Error(`Failed to parse equation: ${error.message}`);
  }

  // Helper for layout
  const computeLayout = () => {
      // Find sources (in-degree 0)
      const inDegree = new Map<string, number>();
      const outEdges = new Map<string, string[]>();
      nodes.forEach(n => { inDegree.set(n.id, 0); outEdges.set(n.id, []); });
      edges.forEach(e => {
          inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
          outEdges.get(e.source)?.push(e.target);
      });

      // BFS to assign levels
      const levels = new Map<string, number>();
      let queue = nodes.filter(n => inDegree.get(n.id) === 0).map(n => n.id);
      let level = 0;
      while(queue.length > 0) {
          const nextQueue: string[] = [];
          queue.forEach(id => {
              levels.set(id, Math.max(levels.get(id) || 0, level));
              outEdges.get(id)?.forEach(target => {
                  if(!nextQueue.includes(target)) nextQueue.push(target);
              });
          });
          queue = nextQueue;
          level++;
      }

      // Assign Y based on index in level
      const nodesAtLevel = new Map<number, string[]>();
      levels.forEach((lvl, id) => {
          if (!nodesAtLevel.has(lvl)) nodesAtLevel.set(lvl, []);
          nodesAtLevel.get(lvl)!.push(id);
      });

      nodes.forEach(n => {
          const l = levels.get(n.id) || 0;
          const siblings = nodesAtLevel.get(l) || [];
          const idx = siblings.indexOf(n.id);
          
          n.position = {
              x: 100 + l * 250,
              y: 100 + idx * 150 - ((siblings.length - 1) * 150) / 2
          };
      });
  };

  computeLayout();

  return { nodes, edges };
}
