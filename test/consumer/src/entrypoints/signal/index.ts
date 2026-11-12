import { defineContentScript } from "wxt/utils/define-content-script";
import { mountSignal } from "./mount-signal";

export default defineContentScript({
  matches: ["*://*/*"],
  async main(ctx) {
    await mountSignal(ctx.signal);
  },
});
