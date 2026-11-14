import type { JSX } from "solid-js";

export function BPanel(props: { title: string }): JSX.Element {
  return <p>{props.title}</p>;
}
