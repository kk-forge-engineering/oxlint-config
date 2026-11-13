/** Renders the rows, or a note when there are none. */
export function Rows(props: { rows: string[] }) {
  return <>{props.rows.length > 0 ? props.rows.map((row) => <li>{row}</li>) : <p>None</p>}</>;
}
