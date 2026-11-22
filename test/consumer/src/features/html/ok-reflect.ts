/** Sets the node's title through the global `Reflect.set`, a key that writes no HTML. */
export const title = (node: HTMLElement, text: string) => Reflect.set(node, "title", text);
