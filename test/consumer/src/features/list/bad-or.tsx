/** Renders the rows, or the rows of a fallback list. */
export function Rows(props: { rows: string[]; fallback: string[] }) {
  return <ul>{props.rows.length === 0 || props.fallback.map((row) => <li>{row}</li>)}</ul>;
}
