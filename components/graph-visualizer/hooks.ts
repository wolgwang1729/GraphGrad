import { useEffect, useState } from "react";
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
