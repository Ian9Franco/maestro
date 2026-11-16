"use client";

import { useEffect, useState } from "react";

export function useCompactViewport(breakpoint = 768) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const apply = () => setCompact(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [breakpoint]);
  return compact;
}