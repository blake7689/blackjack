// Sending one ledger call until the server answers (ADR-0003). The call repeats the same requestId on every
// attempt, so the server applies it at most once.

const RETRY_DELAYS = [1000, 2000, 4000, 8000];

// A fresh v4 id. crypto.randomUUID needs a secure context, so plain http on a LAN address uses getRandomValues. //
export function newRequestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Resolves to { outcome, res }:
//   confirmed: 200, res is the answer
//   rejected:  the server definitely did not apply it (400, 422, another 4xx, or 409 still clashing after 4 retries)
//   dropped:   shouldStop() says the player signed out or changed, or 401; nothing more to do
// No answer (network error, timeout, 5xx, 408, 429) is unknown, never rejected: it retries after 1, 2, 4, 8 s,
// then every 8 s, calling onReconnecting(true) while it does.
export async function sendLedgerCall(call, { shouldStop, onReconnecting }) {
  let clashes = 0;
  let silences = 0;
  for (;;) {
    if (shouldStop()) return { outcome: "dropped" };
    let delay;
    try {
      const res = await call();
      return shouldStop() ? { outcome: "dropped" } : { outcome: "confirmed", res };
    } catch (err) {
      const { status } = err;
      if (status === 401) return { outcome: "dropped" };
      if (status === 409) {
        if (clashes === RETRY_DELAYS.length) return { outcome: "rejected" };
        delay = RETRY_DELAYS[clashes++];
      } else if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        return { outcome: "rejected" };
      } else {
        onReconnecting(true);
        delay = RETRY_DELAYS[Math.min(silences++, RETRY_DELAYS.length - 1)];
      }
    }
    await wait(delay);
  }
}
