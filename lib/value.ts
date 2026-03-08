export class Value {
  data: number;
  grad: number;
  label?: string;
  readonly _prev: Set<Value>;
  readonly _op: string;
  private _backward: () => void;

  constructor(data: number, children: Iterable<Value> = [], op = "", label?: string) {
    this.data = data;
    this.grad = 0;
    this.label = label;
    this._prev = new Set(children);
    this._op = op;
    this._backward = () => undefined;
  }

  private static coerce(other: Value | number): Value {
    return other instanceof Value ? other : new Value(other);
  }

  add(other: Value | number): Value {
    const rhs = Value.coerce(other);
    const out = new Value(this.data + rhs.data, [this, rhs], "+");

    out._backward = () => {
      this.grad += out.grad;
      rhs.grad += out.grad;
    };

    return out;
  }

  mul(other: Value | number): Value {
    const rhs = Value.coerce(other);
    const out = new Value(this.data * rhs.data, [this, rhs], "*");

    out._backward = () => {
      this.grad += rhs.data * out.grad;
      rhs.grad += this.data * out.grad;
    };

    return out;
  }

  pow(exponent: number): Value {
    const out = new Value(this.data ** exponent, [this], `**${exponent}`);

    out._backward = () => {
      this.grad += exponent * this.data ** (exponent - 1) * out.grad;
    };

    return out;
  }

  relu(): Value {
    const out = new Value(this.data < 0 ? 0 : this.data, [this], "ReLU");

    out._backward = () => {
      this.grad += (out.data > 0 ? 1 : 0) * out.grad;
    };

    return out;
  }

  max(other: Value | number): Value {
    const rhs = Value.coerce(other);
    const result = Math.max(this.data, rhs.data);
    const out = new Value(result, [this, rhs], "max");

    out._backward = () => {
      if (this.data >= rhs.data) {
        this.grad += out.grad;
      } else {
        rhs.grad += out.grad;
      }
    };

    return out;
  }

  tanh(): Value {
    const t = Math.tanh(this.data);
    const out = new Value(t, [this], "tanh");

    out._backward = () => {
      this.grad += (1 - t * t) * out.grad;
    };

    return out;
  }

  exp(): Value {
    const e = Math.exp(this.data);
    const out = new Value(e, [this], "exp");

    out._backward = () => {
      this.grad += e * out.grad;
    };

    return out;
  }

  sigmoid(): Value {
    const s = 1 / (1 + Math.exp(-this.data));
    const out = new Value(s, [this], "sigmoid");

    out._backward = () => {
      this.grad += s * (1 - s) * out.grad;
    };

    return out;
  }

  neg(): Value {
    return this.mul(-1);
  }

  sub(other: Value | number): Value {
    return this.add(Value.coerce(other).neg());
  }

  div(other: Value | number): Value {
    return this.mul(Value.coerce(other).pow(-1));
  }

  zeroGrad(): void {
    const topo: Value[] = [];
    const visited = new Set<Value>();

    const buildTopo = (value: Value) => {
      if (visited.has(value)) {
        return;
      }

      visited.add(value);
      value._prev.forEach(buildTopo);
      topo.push(value);
    };

    buildTopo(this);
    topo.forEach((value) => {
      value.grad = 0;
    });
  }

  backward(): void {
    const topo: Value[] = [];
    const visited = new Set<Value>();

    const buildTopo = (value: Value) => {
      if (visited.has(value)) {
        return;
      }

      visited.add(value);
      value._prev.forEach(buildTopo);
      topo.push(value);
    };

    buildTopo(this);
    topo.forEach((value) => {
      value.grad = 0;
    });
    this.grad = 1;

    [...topo].reverse().forEach((value) => {
      value._backward();
    });
  }

  toString(): string {
    return `Value(data=${this.data}, grad=${this.grad})`;
  }
}
