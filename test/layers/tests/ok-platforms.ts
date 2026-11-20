// A test stands in for each platform, so it imports any platform's code.
export { mockIPC } from "@tauri-apps/api/mocks";
export { fakeBrowser } from "wxt/testing/fake-browser";
export { browser } from "../src/infra/chrome/exports";
export { invoke } from "../src/infra/tauri/exports";
