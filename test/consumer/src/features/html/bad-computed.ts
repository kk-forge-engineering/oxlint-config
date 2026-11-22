/** Returns an object that sets `innerHTML` to `text` through a computed string key. */
export const markup = (text: string) => ({ ["innerHTML"]: text });
