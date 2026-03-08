"use client";

import { useEffect, useRef, useState } from "react";

export function Logo({ variant = "clean", size = 32 }: { variant?: "clean" | "fractal"; size?: number }) {
  const pathRef = useRef<SVGPathElement>(null);
  const [d, setD] = useState("");

  const quartic = (x: number) => Math.pow(x, 4) - 2 * Math.pow(x, 2) + 1.2;
  const weierstrass = (x: number) => {
    let y = 0;
    const a = 0.5;
    const b = 3;
    const iterations = 5;
    for (let n = 0; n < iterations; n++) {
      y += Math.pow(a, n) * Math.cos(Math.pow(b, n) * Math.PI * x);
    }
    return y * 0.5 + 1.2;
  };

  useEffect(() => {
    const func = variant === "clean" ? quartic : weierstrass;
    const xMin = -1.6;
    const xMax = 1.6;
    const steps = variant === "clean" ? 50 : 200;
    const points = [];

    for (let i = 0; i <= steps; i++) {
      const xRaw = xMin + (i / steps) * (xMax - xMin);
      const yRaw = func(xRaw);
      const svgX = ((xRaw - xMin) / (xMax - xMin)) * 90 + 5;
      const svgY = 95 - (yRaw / 2.5) * 90;
      points.push(`${svgX},${svgY}`);
    }

    setD(`M ${points[0]} L ${points.slice(1).join(" L ")}`);
  }, [variant]);

  useEffect(() => {
    const pathEl = pathRef.current;
    if (!pathEl || !d) return;

    const length = pathEl.getTotalLength();
    pathEl.style.strokeDasharray = `${length}`;
    pathEl.style.strokeDashoffset = `${length}`;
    // Force reflow
    pathEl.getBoundingClientRect();
    pathEl.style.transition = "stroke-dashoffset 1.5s ease-in-out, opacity 1.5s ease-in-out";
    pathEl.style.strokeDashoffset = "0";
    pathEl.style.opacity = "1";
  }, [d]);

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg viewBox="0 0 100 100" style={{ overflow: "visible", height: "100%", width: "100%" }}>
        <defs>
          <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e5e5e5" />
            <stop offset="100%" stopColor="#4f8ea3" />
          </linearGradient>
        </defs>
        <path
          ref={pathRef}
          d={d}
          fill="none"
          stroke="url(#logo-gradient)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0 }}
        />
      </svg>
    </div>
  );
}
