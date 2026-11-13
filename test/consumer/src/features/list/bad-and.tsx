/** Renders the rows only while the list is open. */
export function Rows(props: { isOpen: boolean; rows: string[] }) {
  return <ul>{props.isOpen && props.rows.map((row) => <li>{row}</li>)}</ul>;
}
