import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetCardStage } from "../utils/cardAnimation";

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  resetCardStage();
  animations.length = 0;
});

// jsdom has no Web Animations API: a stub that records each animation and lets a test finish it (`anim.onfinish()`).
export const animations = [];
Element.prototype.animate = function animate(frames, options) {
  const anim = { el: this, frames, options, onfinish: null, cancel() { this.cancelled = true; }, finish() {} };
  animations.push(anim);
  return anim;
};
Element.prototype.getAnimations = () => [];
