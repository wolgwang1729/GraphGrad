import { describe, it, expect } from "vitest";
import { Value } from "./value";

describe("Value AutoDiff Engine", () => {
  it("should compute forward and backward for simple addition", () => {
    const a = new Value(2.0, [], "", "a");
    const b = new Value(3.0, [], "", "b");
    const c = a.add(b);
    c.backward();

    expect(c.data).toBe(5.0);
    expect(a.grad).toBe(1.0);
    expect(b.grad).toBe(1.0);
  });

  it("should compute forward and backward for multiplication", () => {
    const a = new Value(2.0);
    const b = new Value(-3.0);
    const c = a.mul(b);
    c.backward();

    expect(c.data).toBe(-6.0);
    expect(a.grad).toBe(-3.0); // dc/da = b
    expect(b.grad).toBe(2.0);  // dc/db = a
  });

  it("should accumulate gradients correctly when a node is used multiple times", () => {
    const a = new Value(3.0);
    const b = a.add(a); // b = a + a = 6
    b.backward();

    expect(b.data).toBe(6.0);
    expect(a.grad).toBe(2.0); // db/da = 1 + 1 = 2
  });

  it("should compute gradients for polynomial expressions: f(x) = x^2 + 2x + 1", () => {
    const x = new Value(3.0);
    const x_sq = x.pow(2);
    const two_x = x.mul(2);
    const c = new Value(1.0);
    
    const y = x_sq.add(two_x).add(c);
    y.backward();

    expect(y.data).toBe(16.0); // 3^2 + 2(3) + 1 = 16
    expect(x.grad).toBe(8.0);  // dy/dx = 2x + 2 -> 2(3) + 2 = 8
  });

  it("should compute forward and backward for ReLU", () => {
    const x1 = new Value(-2.0);
    const y1 = x1.relu();
    y1.backward();
    expect(y1.data).toBe(0.0);
    expect(x1.grad).toBe(0.0);

    const x2 = new Value(2.0);
    const y2 = x2.relu();
    y2.backward();
    expect(y2.data).toBe(2.0);
    expect(x2.grad).toBe(1.0);
  });

  it("should compute forward and backward for Sigmoid", () => {
    const x = new Value(0.0); // sigmoid(0) = 0.5
    const y = x.sigmoid();
    y.backward();

    expect(y.data).toBe(0.5);
    // Derivative of sigmoid: s * (1 - s) -> 0.5 * 0.5 = 0.25
    expect(x.grad).toBe(0.25);
  });

  it("should compute forward and backward for Tanh", () => {
    const x = new Value(0.0); // tanh(0) = 0
    const y = x.tanh();
    y.backward();

    expect(y.data).toBe(0.0);
    // Derivative of tanh: 1 - tanh^2(x) -> 1 - 0 = 1
    expect(x.grad).toBe(1.0);
  });

  it("should compute forward and backward for Max", () => {
    const a = new Value(5.0);
    const b = new Value(2.0);
    const y = a.max(b);
    y.backward();

    expect(y.data).toBe(5.0);
    expect(a.grad).toBe(1.0); // Max was 'a', so it gets the gradient
    expect(b.grad).toBe(0.0); // 'b' was ignored, grad is 0
  });

  it("should clear gradients when zeroGrad is called", () => {
    const x = new Value(2.0);
    const y = x.pow(2);
    y.backward();
    
    expect(x.grad).toBe(4.0);
    y.zeroGrad();
    expect(x.grad).toBe(0.0);
  });
});
