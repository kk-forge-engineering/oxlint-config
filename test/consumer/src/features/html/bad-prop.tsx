/** Renders `text` as raw HTML through the `prop:` key of a spread, which Solid writes to the node. */
export const Note = (props: { text: string }) => <div {...{ "prop:innerHTML": props.text }} />;
