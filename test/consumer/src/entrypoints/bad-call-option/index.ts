import { defineContentScript } from "wxt/utils/define-content-script";
import { mountContent } from "./mount-content";
import { getMatches } from "./matches";

export default defineContentScript({
  matches: getMatches(),
  main: () => mountContent(),
});
