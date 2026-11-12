import { defineContentScript } from "wxt/utils/define-content-script";
import { mountContent } from "./mount-content";
import { MATCHES } from "./matches";

export default defineContentScript({
  matches: MATCHES,
  main: () => mountContent(),
});
