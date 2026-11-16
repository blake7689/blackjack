import { useEffect } from "react";
import { applyTheme } from "../utils/theme";

// Applies the display settings to <html> at boot and on every change; "system" mode also follows the device live. //
export function useTheme({ feltTheme, accent, mode, showTotals }) {
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    const apply = () => applyTheme({ feltTheme, accent, mode, showTotals }, !!media?.matches);
    apply();
    if (mode !== "system" || !media) return undefined;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [feltTheme, accent, mode, showTotals]);
}
