import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetCardStage } from "../utils/cardAnimation";

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  if (typeof localStorage !== "undefined") localStorage.clear(); // the saved look (bj.look) must not leak between tests
  resetCardStage();
  animations.length = 0;
  vibrations.length = 0;
  scrolls.length = 0;
});

// jsdom has no Web Animations API: a stub that records each animation and lets a test finish it (`anim.onfinish()`).
export const animations = [];
export const scrolls = [];
if (typeof Element !== "undefined") { // node-environment tests (scripts/*.test.js) have no DOM
Element.prototype.animate = function animate(frames, options) {
  const anim = { el: this, frames, options, onfinish: null, cancel() { this.cancelled = true; }, finish() {} };
  animations.push(anim);
  return anim;
};
Element.prototype.getAnimations = () => [];
Element.prototype.scrollIntoView = function scrollIntoView(options) { scrolls.push({ el: this, options }); }; // jsdom has none (Settings scrolls an opened section into view)
}

// jsdom has no Web Audio or vibration (#86): a stub context whose nodes accept every call, and a recording navigator.vibrate.
export const vibrations = [];
globalThis.AudioContext = class {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = "running"; this.destination = {}; }
  resume() { this.state = "running"; }
  createBuffer(channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
  createGain() { return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
  createBufferSource() { return { connect() {}, start() {}, stop() {} }; }
  createBiquadFilter() { return { frequency: {}, connect() {} }; }
};
if (typeof navigator !== "undefined") navigator.vibrate = (pattern) => { vibrations.push(pattern); return true; };
