import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Position } from "@xyflow/react";

import { TOOLBAR_THRESHOLD_PX } from "./constants";

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
};

export function useTouchLongPress({
  enabled = true,
  durationMs = 600,
  onLongPress,
}: LongPressOptions): LongPressHandlers {
  const timerRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const clearPressTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    pointerIdRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (event: PointerEvent<Element>) => {
      if (!enabled || event.pointerType !== "touch") {
        return;
      }

      clearPressTimer();
      pointerIdRef.current = event.pointerId;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        pointerIdRef.current = null;
        onLongPress();
      }, durationMs);
    },
    [clearPressTimer, durationMs, enabled, onLongPress],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<Element>) => {
      if (event.pointerId !== pointerIdRef.current) {
        return;
      }

      clearPressTimer();
    },
    [clearPressTimer],
  );

  useEffect(() => clearPressTimer, [clearPressTimer]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clearPressTimer,
    onPointerCancel: clearPressTimer,
    onPointerLeave: clearPressTimer,
  };
}
