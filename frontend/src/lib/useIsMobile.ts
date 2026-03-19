import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;

function queryMatches(): boolean {
  return typeof window.matchMedia === "function"
    && window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(queryMatches);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
