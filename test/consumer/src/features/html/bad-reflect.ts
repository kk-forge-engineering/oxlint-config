/** Sets `text` as the node's HTML through `Reflect.set`, and returns whether the write took. */
export const fill = (node: HTMLElement, text: string) => Reflect.set(node, "innerHTML", text);
