import type { JSX } from "solid-js";

export function Panel(props: { title: string }): JSX.Element {
  return <p>{props.title}</p>;
}
