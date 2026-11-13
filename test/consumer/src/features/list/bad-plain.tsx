/** Renders every row, which eslint-plugin-solid's prefer-for reports. */
export function Rows(props: { rows: string[] }) {
  return <ul>{props.rows.map((row) => <li>{row}</li>)}</ul>;
}
