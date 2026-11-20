// A local or a parameter named like a platform global is no global.
const browser = { name: "local" };
export const name = browser.name;
export const pick = (chrome: { tabs: number }) => chrome.tabs;
