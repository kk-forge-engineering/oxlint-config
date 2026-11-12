import { defineContentScript } from "wxt/utils/define-content-script";
import { mountContent } from "./mount-content";
import { report } from "./report";

export default defineContentScript({
  matches: ["*://*/*"],
  main: () => mountContent(),
  onError: () => report(),
});
