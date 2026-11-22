/** Returns an object that sets `outerHTML` to `text` through a computed template-literal key. */
export const markup = (text: string) => ({ [`outerHTML`]: text });
