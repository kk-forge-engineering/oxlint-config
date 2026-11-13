/** Renders the rows when there are any. */
export function Rows(props: { rows?: string[] }) {
  return <ul>{props.rows?.map((row) => <li>{row}</li>) ?? "none"}</ul>;
}
