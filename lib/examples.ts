import type { ComputationExample } from "@/lib/graph-types";

export const COMPUTATION_EXAMPLES: ComputationExample[] = [
  {
    id: "mul-after-add",
    title: "Multiply after add",
    description:
      String.raw`A classic example:$$f(x,y,z) = (x+y)*z$$ Run backprop and see the gradients on the edges.`,
    nodes: [
      { id: "x", kind: "input", label: "x", value: -2, position: { x: 0, y: 0 } },
      { id: "y", kind: "input", label: "y", value: 5, position: { x: 0, y: 100 } },
      { id: "z", kind: "input", label: "z", value: -4, position: { x: 0, y: 220 } },
      { id: "q", kind: "operation", label: "", op: "add", position: { x: 180, y: 50 } },
      { id: "f", kind: "operation", label: "", op: "mul", position: { x: 340, y: 130 } },
      { id: "out", kind: "output", label: "\\text{out}", position: { x: 500, y: 130 } },
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
    title: "Manual Sigmoid",
    description:
      String.raw`A neuron with two inputs, broken down into primitive operations. Here we implement the sigmoid activation manually: $$f(w,x) = \frac{1}{1 + e^{-(w_0x_0 + w_1x_1 + w_2)}}$$`,
    nodes: [
      { id: "w0", kind: "input", label: "w_0", value: 2.00, position: { x: 0, y: 0 } },
      { id: "x0", kind: "input", label: "x_0", value: -1.00, position: { x: 0, y: 80 } },
      { id: "w1", kind: "input", label: "w_1", value: -3.00, position: { x: 0, y: 160 } },
      { id: "x1", kind: "input", label: "x_1", value: -2.00, position: { x: 0, y: 240 } },
      { id: "w2", kind: "input", label: "w_2", value: -3.00, position: { x: 0, y: 320 } },
      { id: "mul1", kind: "operation", label: "", op: "mul", position: { x: 150, y: 40 } },
      { id: "mul2", kind: "operation", label: "", op: "mul", position: { x: 150, y: 200 } },
      { id: "add1", kind: "operation", label: "", op: "add", position: { x: 300, y: 120 } },
      { id: "add2", kind: "operation", label: "", op: "add", position: { x: 450, y: 220 } },
      { id: "neg_c", kind: "input", label: "-1", value: -1.00, position: { x: 475, y: 320 } },
      { id: "neg", kind: "operation", label: "", op: "mul", position: { x: 600, y: 228 } },
      { id: "exp", kind: "operation", label: "", op: "exp", position: { x: 752, y: 228 } },
      { id: "c", kind: "input", label: "1", value: 1.00, position: { x: 762, y: 320 } },
      { id: "add3", kind: "operation", label: "", op: "add", position: { x: 901, y: 235 } },
      { id: "pow", kind: "operation", label: "", op: "pow", parameter: -1, position: { x: 1050, y: 236 } },
      { id: "out", kind: "output", label: "\\text{out}", position: { x: 1201, y: 236 } },
    ],
    edges: [
      { id: "w0-mul1", source: "w0", target: "mul1", targetHandle: "a" },
      { id: "x0-mul1", source: "x0", target: "mul1", targetHandle: "b" },
      { id: "w1-mul2", source: "w1", target: "mul2", targetHandle: "a" },
      { id: "x1-mul2", source: "x1", target: "mul2", targetHandle: "b" },
      { id: "mul1-add1", source: "mul1", target: "add1", targetHandle: "a" },
      { id: "mul2-add1", source: "mul2", target: "add1", targetHandle: "b" },
      { id: "add1-add2", source: "add1", target: "add2", targetHandle: "a" },
      { id: "w2-add2", source: "w2", target: "add2", targetHandle: "b" },
      { id: "add2-neg", source: "add2", target: "neg", targetHandle: "a" },
      { id: "neg_c-neg", source: "neg_c", target: "neg", targetHandle: "b" },
      { id: "neg-exp", source: "neg", target: "exp", targetHandle: "a" },
      { id: "exp-add3", source: "exp", target: "add3", targetHandle: "a" },
      { id: "c-add3", source: "c", target: "add3", targetHandle: "b" },
      { id: "add3-pow", source: "add3", target: "pow", targetHandle: "a" },
      { id: "pow-out", source: "pow", target: "out", targetHandle: "in" },
    ],
  },
  {
    id: "max-multiply",
    title: "Max and Multiply",
    description:
      String.raw`A slightly more complex computation graph with a max operation: $$f(x,y,z,w) = (x * y + \max(z, w)) * 2$$`,
    nodes: [
      { id: "x", kind: "input", label: "x", value: 3.00, position: { x: 0, y: 0 } },
      { id: "y", kind: "input", label: "y", value: -4.00, position: { x: 0, y: 100 } },
      { id: "z", kind: "input", label: "z", value: 2.00, position: { x: 0, y: 220 } },
      { id: "w", kind: "input", label: "w", value: -1.00, position: { x: 0, y: 320 } },
      { id: "mul1", kind: "operation", label: "", op: "mul", position: { x: 180, y: 50 } },
      { id: "max1", kind: "operation", label: "", op: "max", position: { x: 180, y: 270 } },
      { id: "add1", kind: "operation", label: "", op: "add", position: { x: 340, y: 160 } },
      { id: "c2", kind: "input", label: "2", value: 2.00, position: { x: 340, y: 260 } },
      { id: "mul2", kind: "operation", label: "", op: "mul", position: { x: 500, y: 167.55029585798815 } },
      { id: "out", kind: "output", label: "\\text{out}", position: { x: 648.3313609467456, y: 168.23668639053253 } },
    ],
    edges: [
      { id: "x-mul1", source: "x", target: "mul1", targetHandle: "a" },
      { id: "y-mul1", source: "y", target: "mul1", targetHandle: "b" },
      { id: "z-max1", source: "z", target: "max1", targetHandle: "a" },
      { id: "w-max1", source: "w", target: "max1", targetHandle: "b" },
      { id: "mul1-add1", source: "mul1", target: "add1", targetHandle: "a" },
      { id: "max1-add1", source: "max1", target: "add1", targetHandle: "b" },
      { id: "add1-mul2", source: "add1", target: "mul2", targetHandle: "a" },
      { id: "c2-mul2", source: "c2", target: "mul2", targetHandle: "b" },
      { id: "mul2-out", source: "mul2", target: "out", targetHandle: "in" },
    ],
  },
  {
    id: "two-layer-mlp",
    title: "Two-Layer MLP (XOR)",
    description:
      String.raw`A complete two-layer neural network capable of solving the XOR problem. It features a hidden layer with two ReLU neurons and a Sigmoid output neuron. $$f(x_1, x_2) = \sigma\Big(v_1 \text{ReLU}(w_{11} x_1 + w_{21} x_2 + b_1) + v_2 \text{ReLU}(w_{12} x_1 + w_{22} x_2 + b_2) + b_3\Big)$$`,
    nodes: [
      // Inputs & L1 Weights (X=0)
      { id: "w11", kind: "input", label: "w_{11}", value: 1.0, position: { x: 0, y: 40.0 } },
      { id: "x1", kind: "input", label: "x_1", value: 1.0, position: { x: 0, y: 120.0 } },
      { id: "w21", kind: "input", label: "w_{21}", value: 1.0, position: { x: 0, y: 200.0 } },
      { id: "x2", kind: "input", label: "x_2", value: 0.0, position: { x: 0, y: 280.0 } },
      { id: "w12", kind: "input", label: "w_{12}", value: -1.0, position: { x: 0, y: 360.0 } },
      { id: "w22", kind: "input", label: "w_{22}", value: 1.0, position: { x: 0, y: 440.0 } },

      // Layer 1 Multiplications (X=150)
      { id: "mul11", kind: "operation", label: "", op: "mul", position: { x: 150, y: 48.8 } },
      { id: "mul21", kind: "operation", label: "", op: "mul", position: { x: 150, y: 208.8 } },
      { id: "mul12", kind: "operation", label: "", op: "mul", position: { x: 150, y: 368.8 } },
      { id: "mul22", kind: "operation", label: "", op: "mul", position: { x: 150, y: 448.8 } },

      // Layer 1 Additions & Bias (X=300 & X=450)
      { id: "add_h1_1", kind: "operation", label: "", op: "add", position: { x: 300, y: 57.6 } },
      { id: "b1", kind: "input", label: "b_1", value: -0.5, position: { x: 300, y: 150.0 } },
      { id: "add_h2_1", kind: "operation", label: "", op: "add", position: { x: 300, y: 377.6 } },
      { id: "b2", kind: "input", label: "b_2", value: -1.5, position: { x: 300, y: 480.0 } },

      { id: "add_h1_b", kind: "operation", label: "", op: "add", position: { x: 450, y: 66.4 } },
      { id: "add_h2_b", kind: "operation", label: "", op: "add", position: { x: 450, y: 386.4 } },

      // Layer 1 Activations & L2 Weights (X=600)
      { id: "relu1", kind: "operation", label: "", op: "relu", position: { x: 600, y: 66.4 } },
      { id: "v1", kind: "input", label: "v_1", value: 2.0, position: { x: 600, y: 232.4 } },
      { id: "v2", kind: "input", label: "v_2", value: -4.0, position: { x: 600, y: 321.2 } },
      { id: "relu2", kind: "operation", label: "", op: "relu", position: { x: 600, y: 386.4 } },

      // Layer 2 Operations (X=750 to X=1050)
      { id: "mul_v1", kind: "operation", label: "", op: "mul", position: { x: 750, y: 241.2 } },
      { id: "mul_v2", kind: "operation", label: "", op: "mul", position: { x: 750, y: 330.0 } },
      
      { id: "add_out_1", kind: "operation", label: "", op: "add", position: { x: 900, y: 250.0 } },
      { id: "b3", kind: "input", label: "b_3", value: -1.0, position: { x: 900, y: 360.0 } },
      
      { id: "add_out_b", kind: "operation", label: "", op: "add", position: { x: 1050, y: 258.8 } },

      // Output Activation (X=1200 & X=1350)
      { id: "sig_out", kind: "operation", label: "", op: "sigmoid", position: { x: 1200, y: 258.8 } },
      { id: "out", kind: "output", label: "\\text{out}", position: { x: 1350, y: 258.8 } }
    ],
    edges: [
      // L1 connections
      { id: "e_w11_mul11", source: "w11", target: "mul11", targetHandle: "a" },
      { id: "e_x1_mul11", source: "x1", target: "mul11", targetHandle: "b" },
      { id: "e_w21_mul21", source: "w21", target: "mul21", targetHandle: "a" },
      { id: "e_x2_mul21", source: "x2", target: "mul21", targetHandle: "b" },
      { id: "e_w12_mul12", source: "w12", target: "mul12", targetHandle: "a" },
      { id: "e_x1_mul12", source: "x1", target: "mul12", targetHandle: "b" },
      { id: "e_w22_mul22", source: "w22", target: "mul22", targetHandle: "a" },
      { id: "e_x2_mul22", source: "x2", target: "mul22", targetHandle: "b" },

      { id: "e_m11_add1", source: "mul11", target: "add_h1_1", targetHandle: "a" },
      { id: "e_m21_add1", source: "mul21", target: "add_h1_1", targetHandle: "b" },
      { id: "e_m12_add2", source: "mul12", target: "add_h2_1", targetHandle: "a" },
      { id: "e_m22_add2", source: "mul22", target: "add_h2_1", targetHandle: "b" },

      { id: "e_add1_add1b", source: "add_h1_1", target: "add_h1_b", targetHandle: "a" },
      { id: "e_b1_add1b", source: "b1", target: "add_h1_b", targetHandle: "b" },
      { id: "e_add2_add2b", source: "add_h2_1", target: "add_h2_b", targetHandle: "a" },
      { id: "e_b2_add2b", source: "b2", target: "add_h2_b", targetHandle: "b" },

      // L1 activations
      { id: "e_add1b_relu1", source: "add_h1_b", target: "relu1", targetHandle: "a" },
      { id: "e_add2b_relu2", source: "add_h2_b", target: "relu2", targetHandle: "a" },

      // L2 connections
      { id: "e_v1_mulv1", source: "v1", target: "mul_v1", targetHandle: "a" },
      { id: "e_relu1_mulv1", source: "relu1", target: "mul_v1", targetHandle: "b" },
      { id: "e_v2_mulv2", source: "v2", target: "mul_v2", targetHandle: "a" },
      { id: "e_relu2_mulv2", source: "relu2", target: "mul_v2", targetHandle: "b" },

      { id: "e_mulv1_addout", source: "mul_v1", target: "add_out_1", targetHandle: "a" },
      { id: "e_mulv2_addout", source: "mul_v2", target: "add_out_1", targetHandle: "b" },
      
      { id: "e_addout_addoutb", source: "add_out_1", target: "add_out_b", targetHandle: "a" },
      { id: "e_b3_addoutb", source: "b3", target: "add_out_b", targetHandle: "b" },

      // Output
      { id: "e_addoutb_sig", source: "add_out_b", target: "sig_out", targetHandle: "a" },
      { id: "e_sig_out", source: "sig_out", target: "out", targetHandle: "in" }
    ],
  }
];
