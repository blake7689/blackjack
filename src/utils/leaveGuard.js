// Settings sets `ask` while it holds unsaved changes (#84); the nav actions (hooks/useNavActions.js) call it before leaving: `ask(go)` shows
// "Discard your changes?" and runs `go` on Discard. react-router's useBlocker does not work with <BrowserRouter>, so this is the guard.
export const leaveGuard = { ask: null };
