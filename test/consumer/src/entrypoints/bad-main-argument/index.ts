import { defineContentScript } from "wxt/utils/define-content-script";
import { mountContent } from "./mount-content";
import { findRoot } from "./root";

export default defineContentScript({
  matches: ["*://*/*"],
  main: (ctx) => mountContent(findRoot(ctx)),
});
