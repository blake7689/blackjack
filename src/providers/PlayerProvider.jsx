import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { PlayerContext } from "../context/PlayerContext";
import { getToken, setUnauthorizedHandler, COLD_START_TIMEOUT_MS } from "../utils/api";
import {
  getMe, loginPlayer, registerPlayer, updateProfile, changePassword as changePasswordApi,
  deleteMe, logoutPlayer, placeBet, settleRound, topUp as topUpApi,
} from "../utils/playerEngine";
import { newRequestId, sendLedgerCall } from "../utils/ledgerCall";

export function PlayerProvider({ children }) {
  const [player, setPlayer] = useState(null);
  const [creditChange, setCreditChange] = useState(null);
  // The latest player, updated synchronously so back-to-back credit changes never read a stale balance.
  const playerRef = useRef(null);
  // Displayed balance = the server's last answer + chips moved locally but not yet staked (unsent)
  // + optimistic changes whose ledger call hasn't answered yet (pending).
  const unsentRef = useRef(0);
  const pendingRef = useRef(0);
  // Ledger calls run one at a time, in the order the game made them.
  const queueRef = useRef(Promise.resolve());
  // Set when a round's opening bet is refused: the rest of that round's bets are then dropped unsent.
  const roundRefusedRef = useRef(false);
  const [reconnecting, setReconnecting] = useState(false);
  // A saved session is being restored (up to a cold API start): the table shows Loading, not Home, until it is answered.
  const [restoring, setRestoring] = useState(() => !!getToken());
  // The restore got no answer (network, timeout, 5xx): the app shows its Error screen (Try again / Home) instead of acting signed out (#87).
  const [restoreFailed, setRestoreFailed] = useState(false);
  // A message for the Login page (e.g. after a password change we could not sign back in from); cleared by the next sign-in.
  const [notice, setNotice] = useState(null);
  // Counts sign-ins and sign-outs: "same player" for queued work means the same count, not the same token,
  // because a password change swaps the token without changing the player (#171).
  const sessionRef = useRef(0);

  const signIn = useCallback((p) => {
    sessionRef.current += 1;
    if (p) setNotice(null);
    playerRef.current = p;
    unsentRef.current = 0;
    pendingRef.current = 0;
    roundRefusedRef.current = false;
    setPlayer(p);
    return p;
  }, []);

  const setCredits = useCallback((credits) => {
    playerRef.current = { ...playerRef.current, credits };
    setPlayer(playerRef.current);
  }, []);

  // Restore a session after a page refresh; an expired token (401, which clears it) just leaves you signed out; any other failure keeps the token and
  // sets `restoreFailed`. Ignore a late answer if you logged out or in as someone else meanwhile (the session changed).
  const restore = useCallback(() => {
    if (!getToken()) return;
    const session = sessionRef.current;
    const same = () => sessionRef.current === session && !!getToken(); // no sign-in or sign-out since, and the token was not cleared (a 401)
    setRestoring(true);
    setRestoreFailed(false);
    // then(ok, fail), not then().catch(): only getMe's own failure means "no answer"; an error while signing in is a bug, logged, not an Error screen.
    getMe(COLD_START_TIMEOUT_MS).then((p) => { if (same()) signIn(p); }, () => { if (same()) setRestoreFailed(true); })
      .catch((error) => console.error("Restoring the session failed", error))
      .finally(() => setRestoring(false));
  }, [signIn]);
  useEffect(restore, [restore]);
  const skipRestore = useCallback(() => setRestoreFailed(false), []);

  // Any signed-in request that gets 401 signs you out here.
  useEffect(() => {
    setUnauthorizedHandler(() => signIn(null));
    return () => setUnauthorizedHandler(() => {});
  }, [signIn]);

  const login = useCallback(async (credentials) => signIn(await loginPlayer(credentials)), [signIn]);
  const addPlayer = useCallback(async (payload) => signIn(await registerPlayer(payload)), [signIn]);
  const updatePlayer = useCallback(async (profile) => {
    const updated = await updateProfile(profile);
    playerRef.current = { ...updated, credits: playerRef.current.credits };
    setPlayer(playerRef.current);
    return playerRef.current;
  }, []);
  // One change at a time (#196): the first revokes the token, so a second request would 401 and sign the player out. Held here, not in
  // Settings, so it survives leaving that page. A press while one runs sends nothing and resolves false.
  const changingRef = useRef(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    if (changingRef.current) return false;
    changingRef.current = true;
    setChangingPassword(true);
    try {
      if (await changePasswordApi(currentPassword, newPassword, playerRef.current?.userName)) {
        signIn(null);
        setNotice("Your password was changed, but we could not sign you in again. Please sign in with your new password.");
      }
    } finally {
      changingRef.current = false;
      setChangingPassword(false);
    }
  }, [signIn]);
  const deletePlayer = useCallback(async (currentPassword) => {
    await deleteMe(currentPassword);
    signIn(null);
  }, [signIn]);
  const logout = useCallback(() => {
    logoutPlayer();
    signIn(null);
  }, [signIn]);

  {/* CREDITS */} /////////////////////////////////////////////////////////////////////////////////

  const getCredits = useCallback(() => playerRef.current?.credits ?? 0, []);

  // The badge says what the balance just did; a change of nothing (a settled loss) takes an older badge away: nothing shows after a loss.
  const showChange = useCallback((delta) => {
    setCreditChange((prev) => (delta !== 0 ? { delta, seq: (prev?.seq ?? 0) + 1 } : null));
  }, []);

  // Sends one ledger call after the ones before it (the queue stays serial, so a retrying call blocks the rest),
  // then shows the server's balance plus local changes. It stops quietly if the player signed out or changed
  // since it was queued, so one player's retry is never charged to another. report(seq, outcome) tells the game.
  const enqueue = useCallback(({ seq, quiet, newRound, optimistic, call }, report) => {
    const session = sessionRef.current;
    const stop = () => !playerRef.current || sessionRef.current !== session;
    pendingRef.current += optimistic;
    queueRef.current = queueRef.current.then(async () => {
      const reload = async () => {
        try {
          const { credits } = await getMe();
          if (!stop()) setCredits(credits + unsentRef.current + pendingRef.current);
        } catch (err) {
          console.error("Reloading the balance failed", err);
        }
      };
      // What the catch below must still do if a step throws: release the pending amount, undo the optimistic change.
      let held = optimistic;
      let undo = optimistic;
      let outcome;
      try {
        if (newRound) roundRefusedRef.current = false;
        const skipped = newRound === false && roundRefusedRef.current;
        let res;
        ({ outcome, res } = skipped && !stop()
          ? { outcome: "rejected" }
          : await sendLedgerCall(call, { shouldStop: stop, onReconnecting: setReconnecting }));
        setReconnecting(false);
        if (outcome === "dropped" || stop()) return report(seq, "confirmed"); // balances were reset by the sign-out
        pendingRef.current -= held;
        held = 0;
        if (outcome === "confirmed") {
          setCredits(res.credits + unsentRef.current + pendingRef.current);
          return report(seq, "confirmed");
        }
        if (!quiet) console.error("Ledger call refused; the game drops it", seq);
        if (newRound) roundRefusedRef.current = true;
        setCredits(playerRef.current.credits - undo); // undo the optimistic change even if the reload below fails
        undo = 0;
        if (!skipped) await reload();
        report(seq, stop() ? "confirmed" : "rejected"); // signed out during the reload: the refusal must not reach the next table (#195)
      } catch (err) {
        // sendLedgerCall handles its own errors, so this ran after the server answered. The chain must never reject:
        // that would skip every later bet, settle and top-up. A confirmed call was applied, so report it as such.
        console.error("Ledger step failed", seq, err);
        setReconnecting(false);
        if (stop()) return report(seq, "confirmed"); // as above; the sign-out already reset the balances
        pendingRef.current -= held;
        if (outcome === "confirmed") {
          await reload();
          return report(seq, "confirmed");
        }
        setCredits(playerRef.current.credits - undo);
        report(seq, "rejected");
      }
    });
  }, [setCredits]);

  // Applies one credit event from the game reducer: local chip moves, ledger bets, and the round's settlement. //
  const applyCreditEvent = useCallback((event, report) => {
    if (!playerRef.current) return report(event.seq, "confirmed"); // signed out: nothing to wait for
    if (event.kind === "local") {
      unsentRef.current += event.amount;
      setCredits(playerRef.current.credits + event.amount);
      showChange(event.amount);
    } else if (event.kind === "bet") {
      const requestId = newRequestId(); // once per event; every retry reuses it
      const call = () => placeBet(event.amount, event.newRound, requestId);
      const common = { seq: event.seq, newRound: event.newRound, call };
      if (event.alreadyDeducted) {
        // The chips were taken from the balance locally; they now move to the server.
        unsentRef.current += event.amount;
        enqueue({ ...common, optimistic: 0 }, report);
      } else {
        setCredits(playerRef.current.credits - event.amount);
        showChange(-event.amount);
        enqueue({ ...common, optimistic: -event.amount }, report);
      }
    } else {
      setCredits(playerRef.current.credits + event.amount);
      showChange(event.amount);
      const requestId = newRequestId();
      enqueue({ seq: event.seq, optimistic: event.amount, call: () => settleRound(event.amount, requestId) }, report);
    }
  }, [enqueue, setCredits, showChange]);

  // The hidden top-up (#90). Joins the ledger queue so it is ordered with bets and settles and retries an unknown
  // outcome with one requestId. Resolves { ok } or { ok: false, locked, retryAfter }; the code is never logged or kept.
  const topUp = useCallback((code) => new Promise((resolve) => {
    const requestId = newRequestId();
    const session = sessionRef.current;
    let applied = false;
    let locked = null;
    let before = 0;
    const call = () => {
      before = getCredits(); // the displayed balance, to show how far the top-up moved it
      return topUpApi(code, requestId).then((res) => { applied = true; return res; }, (err) => {
        if (err.status !== 429) throw err;
        locked = { retryAfter: err.retryAfter };
        throw Object.assign(new Error("locked"), { status: 400 }); // a definite refusal: sendLedgerCall must not retry it
      });
    };
    enqueue({ quiet: true, optimistic: 0, call }, (_, outcome) => {
      // enqueue reports a dropped call (sign-out, other player) as "confirmed" too, so check for that here: no badge then.
      const ok = outcome === "confirmed" && applied && !!playerRef.current && sessionRef.current === session;
      if (ok) showChange(getCredits() - before); // enqueue has already set the new balance
      resolve(ok ? { ok: true } : { ok: false, locked: locked !== null, retryAfter: locked?.retryAfter });
    });
  }), [enqueue, getCredits, showChange]);

  // The +/- badge next to the balance fades after a moment. //
  useEffect(() => {
    if (!creditChange) return;
    const timer = setTimeout(() => setCreditChange(null), 3000);
    return () => clearTimeout(timer);
  }, [creditChange]);

  const value = useMemo(
    () => ({ player, creditChange, reconnecting, notice, restoring, restoreFailed, retryRestore: restore, skipRestore, login, addPlayer, updatePlayer, changePassword, changingPassword, deletePlayer, logout, getCredits, applyCreditEvent, topUp }),
    [player, creditChange, reconnecting, notice, restoring, restoreFailed, restore, skipRestore, login, addPlayer, updatePlayer, changePassword, changingPassword, deletePlayer, logout, getCredits, applyCreditEvent, topUp]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
