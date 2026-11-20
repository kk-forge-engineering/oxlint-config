export const at = Date.now();
export const mode = process.env.MODE;
export const n = Math.random();
export const title = chrome.i18n.getMessage("title");
export const load = () => fetch("/api");
export const language = navigator.language;
export const path = location.pathname;
export const draft = localStorage.getItem("draft") ?? sessionStorage.getItem("draft");
export const open = () => indexedDB.open("screenshots");
