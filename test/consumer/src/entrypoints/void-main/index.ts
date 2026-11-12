import { defineContentScript } from "wxt/utils/define-content-script";
import { mountVoid } from "./mount-void";

export default defineContentScript({
  matches: ["*://*/*"],
  main(ctx) {
    void mountVoid(ctx);
  },
});
