// A local named require loads nothing.
const require = (name: string) => name;
export const api = require("@tauri-apps/api");
