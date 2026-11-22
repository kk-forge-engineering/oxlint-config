/** Sets `text` as the node's HTML without escaping it, and returns the node. */
export const fill = (node: HTMLElement, text: string) => Object.assign(node, { innerHTML: text });
