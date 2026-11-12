import { defineContentScript } from "wxt/utils/define-content-script";
import { mountOverlay } from "./mount-overlay";

export default defineContentScript({
  matches: [`*://example.com/*`],
  cssInjectionMode: "ui",
  allFrames: false,
  main(ctx) {
    mountOverlay(ctx);
  },
});
