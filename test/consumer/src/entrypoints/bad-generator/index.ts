import { defineContentScript } from "wxt/utils/define-content-script";
import { mountContent } from "./mount-content";

export default defineContentScript({
  matches: ["*://*/*"],
  *main() {
    mountContent();
  },
});
