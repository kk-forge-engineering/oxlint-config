import { defineContentScript } from "wxt/utils/define-content-script";
import { mountContent } from "./mount-content";
import { track } from "./track";

export default defineContentScript({
  matches: ["*://*/*"],
  main() {
    mountContent();
    track();
  },
});
