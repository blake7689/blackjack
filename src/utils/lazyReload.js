import { lazy } from "react";

const KEY = "bj.chunkReload";

// A lazy chunk that will not load (a tab left open across a deploy, or offline) would white-screen the app (no error boundary). Reload once to get the
// new build's chunk names; the flag in sessionStorage stops a second failure (still offline) from looping, and a successful load clears it (#169).
export function guardImport(load) {
  return () => load().then(
    (mod) => { try { sessionStorage.removeItem(KEY); } catch { /* storage blocked: nothing to clear */ } return mod; },
    (err) => {
      let reload = false;
      try {
        if (sessionStorage.getItem(KEY) !== "1") { sessionStorage.setItem(KEY, "1"); reload = true; }
      } catch { /* no flag can be kept, so a reload could loop: fail instead */ }
      if (!reload) throw err;
      window.location.reload();
      return new Promise(() => {}); // never settles: the page is reloading
    },
  );
}

export const lazyReload = (load) => lazy(guardImport(load));
