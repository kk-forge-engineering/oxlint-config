// A local or a parameter named like a watched global is no global, so the rule leaves it alone.
const Date = { now: () => 0 };
export const at = Date.now();
export const run = (setTimeout: (callback: () => void) => void) => setTimeout(() => undefined);
const chrome = { i18n: { getMessage: (name: string) => name } };
export const title = chrome.i18n.getMessage("title");
