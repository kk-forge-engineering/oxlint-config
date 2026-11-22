/** Renders `text` as raw HTML through a spread prop. */
export const Note = (props: { text: string }) => <div {...{ innerHTML: props.text }} />;
