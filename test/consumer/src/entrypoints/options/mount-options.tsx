import { render } from "solid-js/web";
import "./options.css";

/** Mounts the options page into the document body. */
export function mountOptions(): void {
  const root = document.body;
  render(() => <main>Options</main>, root);
}
