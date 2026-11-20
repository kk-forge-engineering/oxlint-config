// What defines or mounts an entrypoint, and the types of what it mounts.
import { createShadowRootUi, type ContentScriptContext, type ShadowRootContentScriptUi } from "#imports";
import { createIframeUi } from "wxt/utils/content-script-ui/iframe";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
export type Context = import("#imports").ContentScriptContext;
export type { ContentScriptContext, ShadowRootContentScriptUi };
export { createShadowRootUi, createIframeUi, defineUnlistedScript };
