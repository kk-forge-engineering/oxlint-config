// A local named like the global is no global.
const electronAPI = { send: () => undefined };
export const send = electronAPI.send;
