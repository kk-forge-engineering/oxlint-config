// WXT defines an entrypoint through its SDK, which an extension entrypoint may import.
import { defineBackground } from "#imports";
import { defineContentScript } from "wxt/utils/define-content-script";
import { browser } from "../../infra/chrome/exports";
export { defineBackground, defineContentScript, browser };
