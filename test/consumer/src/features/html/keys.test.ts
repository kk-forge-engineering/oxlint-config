/** Fills `node` with a fixed HTML string. A test page is one no user sees, so it may set HTML from a string. */
export const setUp = (node: HTMLElement) => Object.assign(node, { innerHTML: "<p>a</p>" });
