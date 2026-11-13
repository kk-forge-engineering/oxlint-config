import { For, Show } from "solid-js";

/** Renders the rows only while the list is open, which keeps each row's node. */
export function Rows(props: { isOpen: boolean; rows: string[] }) {
  return (
    <ul title={props.rows.map((row) => row.trim()).join(", ")} data-rows={props.isOpen && props.rows.map((row) => row.trim())}>
      <Show when={props.isOpen}>
        <For each={props.rows}>{(row) => <li>{row}</li>}</For>
      </Show>
      {props.isOpen && props.rows.length}
    </ul>
  );
}
