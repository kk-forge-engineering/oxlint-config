// The chrome adapter uses the extension API and the interface strings it holds.
export const area = chrome.storage.local;
export const send = () => browser.runtime.sendMessage({});
export const title = chrome.i18n.getMessage("title");
