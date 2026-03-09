# [GraphGrad](https://graphgrad.vercel.app/)

GraphGrad is an interactive computation graph visualizer for learning forward passes and backpropagation. Build graphs manually, generate them from equations, and inspect node values and gradients directly on the canvas.

## Preview

### Light Mode

![GraphGrad light mode](https://i.sstatic.net/9QQyZhbK.png)

### Dark Mode

![GraphGrad dark mode](https://i.sstatic.net/MB96ELUp.png)

## Features

- Interactive graph editor built with React Flow
- Forward evaluation and backward gradient propagation
- Edge labels for forward values and gradients
- Equation-to-graph generation using `mathjs`
- Built-in examples for common backprop patterns
- Editable input values, operation parameters, and node labels
- Light and dark mode UI

## Built-in Examples

- Multiply after add: $f(x, y, z) = (x + y) * z$
- Manual sigmoid neuron
- Max and multiply: $f(x, y, z, w) = (x * y + \max(z, w)) * 2$

## Supported Operations

- Binary: `add`, `mul`, `sub`, `div`, `max`
- Unary: `pow`, `neg`, `relu`, `tanh`, `exp`, `sigmoid`, `log`

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- React Flow (`@xyflow/react`)
- `mathjs`
- KaTeX / `react-katex`
- Vitest

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the development server

```bash
npm run dev
```

### 3. Open the app

Visit http://localhost:3000

## Available Scripts

```bash
npm run dev      # start local development server
npm run build    # create production build
npm run start    # start production server
npm run lint     # run ESLint
npm run test     # run Vitest once
npm run test:watch
npm run test:ui
```

## Project Structure

```text
app/                    Next.js app router entrypoints
components/             UI and graph editor components
lib/                    Graph types, parser, evaluator, tests, examples
public/                 Static assets
```

## How It Works

1. Create a graph manually or generate one from an equation.
2. Set input values and choose operations.
3. Run `Forward` to compute output values.
4. Run `Backprop` to propagate gradients from the output node.
5. Inspect node values and edge annotations to understand the computation.

## Notes

- Graphs must remain acyclic for evaluation.
- Output nodes must have exactly one incoming edge.
- `pow` uses a constant exponent parameter.

## Deployment

The app is deployed on Vercel:

https://graphgrad.vercel.app/

## Acknowledgements

- The autodiff and backpropagation learning approach is adapted from Andrej Karpathy's micrograd: https://github.com/karpathy/micrograd/tree/master
- The website UI is inspired by Alex Lenail's NN-SVG visualization style: https://alexlenail.me/NN-SVG/AlexNet.html
- Some examples are taken from the CS231 course.
