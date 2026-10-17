import { useEffect } from "react";

// Publishes an element's height as a CSS variable on <html> (used for the header and footer offsets). //
export function useCssVarHeight(ref, cssVar) {
  useEffect(() => {
    const el = ref.current;
    const setVar = () => {
      document.documentElement.style.setProperty(cssVar, `${Math.ceil(el.getBoundingClientRect().height)}px`);
    };
    setVar();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(setVar);
    observer?.observe(el);
    window.addEventListener("resize", setVar);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", setVar);
    };
  }, [ref, cssVar]);
}
