import { useCallback, useEffect, useRef, useState, type PointerEvent, type TouchEvent } from "react";
import { Position } from "@xyflow/react";

import { TOOLBAR_THRESHOLD_PX } from "./constants";

const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

export function useToolbarPosition(nodeRef: React.RefObject<HTMLDivElement | null>): Position {
  const [pos, setPos] = useState<Position>(Position.Top);

  useEffect(() => {
    const el = nodeRef.current;
    if (!el) return;

    function measure() {
      const nodeEl = nodeRef.current;
      if (!nodeEl) return;
      const rfContainer = nodeEl.closest(".react-flow") as HTMLElement | null;
      if (!rfContainer) return;
      const containerRect = rfContainer.getBoundingClientRect();
      const nodeRect = nodeEl.getBoundingClientRect();
      const spaceAbove = nodeRect.top - containerRect.top;
      setPos(spaceAbove < TOOLBAR_THRESHOLD_PX ? Position.Bottom : Position.Top);
    }

    measure();
    const rfContainer = el.closest(".react-flow") as HTMLElement | null;
    if (!rfContainer) return;

    const observer = new MutationObserver(measure);
    const viewport = rfContainer.querySelector(".react-flow__viewport");
    if (viewport) {
      observer.observe(viewport, { attributes: true, attributeFilter: ["style"] });
    }

    rfContainer.addEventListener("wheel", measure, { passive: true });
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      rfContainer.removeEventListener("wheel", measure);
      window.removeEventListener("resize", measure);
    };
  }, [nodeRef]);

  return pos;
}

type LongPressOptions = {
  enabled?: boolean;
  durationMs?: number;
  onLongPress: () => void;
};

type LongPressHandlers = {
  onPointerDown: (event: PointerEvent<Element>) => void;
  onPointerMove: (event: PointerEvent<Element>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onTouchStart: (event: TouchEvent<Element>) => void;
  onTouchMove: (event: TouchEvent<Element>) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
};

export function useTouchLongPress({
  enabled = true,
  durationMs = 600,
  onLongPress,
}: LongPressOptions): LongPressHandlers {
  const timerRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const sourceRef = useRef<"pointer" | "touch" | null>(null);
  const startPositionRef = useRef<{ x: number; y: number } | null>(null);

  const clearPressTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    pointerIdRef.current = null;
    sourceRef.current = null;
    startPositionRef.current = null;
  }, []);

  const startLongPress = useCallback(
    (x: number, y: number, source: "pointer" | "touch") => {
      clearPressTimer();
      sourceRef.current = source;
      startPositionRef.current = { x, y };
      timerRef.current = window.setTimeout(() => {
        clearPressTimer();
        onLongPress();
      }, durationMs);
    },
    [clearPressTimer, durationMs, onLongPress],
  );

  const shouldCancelForMove = useCallback((x: number, y: number) => {
    const start = startPositionRef.current;
    if (!start) {
      return false;
    }

    const deltaX = x - start.x;
    const deltaY = y - start.y;
    return Math.hypot(deltaX, deltaY) > LONG_PRESS_MOVE_TOLERANCE_PX;
  }, []);

  const onPointerDown = useCallback(
    (event: PointerEvent<Element>) => {
      if (!enabled) {
        return;
      }

      if (event.pointerType === "mouse") {
        return;
      }

      if (sourceRef.current === "touch") {
        return;
      }

      pointerIdRef.current = event.pointerId;
      startLongPress(event.clientX, event.clientY, "pointer");
    },
    [enabled, startLongPress],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<Element>) => {
      if (sourceRef.current !== "pointer") {
        return;
      }

      if (event.pointerId !== pointerIdRef.current) {
        return;
      }

      if (shouldCancelForMove(event.clientX, event.clientY)) {
        clearPressTimer();
      }
    },
    [clearPressTimer, shouldCancelForMove],
  );

  const onTouchStart = useCallback(
    (event: TouchEvent<Element>) => {
      if (!enabled || event.touches.length === 0) {
        return;
      }

      const firstTouch = event.touches[0];
      startLongPress(firstTouch.clientX, firstTouch.clientY, "touch");
    },
    [enabled, startLongPress],
  );

  const onTouchMove = useCallback(
    (event: TouchEvent<Element>) => {
      if (sourceRef.current !== "touch" || event.touches.length === 0) {
        return;
      }

      const firstTouch = event.touches[0];
      if (shouldCancelForMove(firstTouch.clientX, firstTouch.clientY)) {
        clearPressTimer();
      }
    },
    [clearPressTimer, shouldCancelForMove],
  );

  useEffect(() => clearPressTimer, [clearPressTimer]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clearPressTimer,
    onPointerCancel: clearPressTimer,
    onPointerLeave: clearPressTimer,
    onTouchStart,
    onTouchMove,
    onTouchEnd: clearPressTimer,
    onTouchCancel: clearPressTimer,
  };
}
