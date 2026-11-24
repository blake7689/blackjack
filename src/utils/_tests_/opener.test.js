import { describe, it, expect, beforeEach, vi } from "vitest";

// Each test imports a fresh copy: the pressed element is module state.
const load = async () => { vi.resetModules(); return (await import("../opener")).focusTarget; };
const press = (el) => el.dispatchEvent(new Event("pointerdown", { bubbles: true }));

describe("focusTarget (#172)", () => {
  beforeEach(() => { document.body.innerHTML = '<button id="b"><span id="s">x</span></button><a id="l" href="/x">go</a><input id="i" />'; });

  it("is null when nothing was pressed and nothing has focus", async () => {
    const focusTarget = await load();
    expect(focusTarget()).toBeNull();
  });

  it("returns the pressed button when focus is on the body (WebKit)", async () => {
    const focusTarget = await load();
    press(document.getElementById("s")); // a press on a child finds the button
    expect(focusTarget()).toBe(document.getElementById("b"));
  });

  it("returns a pressed link", async () => {
    const focusTarget = await load();
    press(document.getElementById("l"));
    expect(focusTarget()).toBe(document.getElementById("l"));
  });

  it("prefers the focused element", async () => {
    const focusTarget = await load();
    press(document.getElementById("b"));
    document.getElementById("i").focus();
    expect(focusTarget()).toBe(document.getElementById("i"));
  });

  it("is null when the pressed element has left the page", async () => {
    const focusTarget = await load();
    press(document.getElementById("b"));
    document.getElementById("b").remove();
    expect(focusTarget()).toBeNull();
  });

  it("forgets the opener when a later press hits no button", async () => {
    const focusTarget = await load();
    press(document.getElementById("b"));
    press(document.getElementById("i"));
    expect(focusTarget()).toBeNull();
  });
});
