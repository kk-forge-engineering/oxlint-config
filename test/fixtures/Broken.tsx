// This code breaks each typescript.json and solid.json rule that configs.test.ts lists, and the test expects every one
// of them reported. Long.ts breaks max-lines, which judges a whole file.
import "./register";
import { createSignal, Show } from "solid-js";
import tool from "./utils/tool";
// @ts-ignore
let count: any = 1;
Promise.resolve(count);
export function Broken(props: { html: string }) {
  return <div innerHTML={props.html} />;
}
export function loop(limit: number) {
  let left = 0;
  while (left < limit) {
    count = count + 1;
  }
  return left;
}
export const total = String
(count);
Object.prototype.extra = 1;
export function rethrow() {
  try {
    loop(1);
  } catch (error) {
    throw new Error("loop failed");
  }
}
export function sum(a: number, b: number) {
  a += a + b;
  return a;
}
window.postMessage("ready");
export class Holder {
  get value(): number {
    return this.value;
  }
}
export const rows = new Array(3).fill([]);
enum Kind {
  A = "a",
}
export const isA = (kind: string) => kind === Kind.A;
console.log(isA("a"));
declare const loose: any;
loose.run();
export const field = loose.field;
export function leak(): string {
  return loose;
}
Math.max(loose);
enum Shade {
  Dark = "dark",
}
export const shade: Shade = "dark" as unknown as Kind;
export function fail() {
  throw "failed";
}
export const plain: string = String(1);
export const label = plain as string;
export const text = String("a");
function made<T = string>(): T[] {
  return [];
}
export const items = made<string>();
export function first<T>(value: T): void {
  console.info(value);
}
export const isOn = (flag: boolean) => flag === true;
export const name = `${"a"}`;
export class Tools {
  static run() {}
}
export function Picture() {
  return <img src="a.png" />;
}
export function Nested() {
  return (
    <p>
      <div />
    </p>
  );
}
export const ran = tool.run;
export function Counter() {
  const [count] = createSignal(0);
  let input: HTMLInputElement;
  return <input value={count} onInput={() => input.focus()} />;
}
export const assigned: string = loose;
export const narrowed = (plain as unknown) as number;
export const parsed = Number.parseInt("1") as 1;
export const escaped = escape("a");
export const rejected = Promise.reject("failed");
export const loose2 = plain == "a";
if (isOn(true)) console.info("on");
export const [shared] = createSignal(0);
export const isMissing = plain == null;
export function Cells(props: { on: boolean }) {
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <Show when={props.on}>
              <span>
                <b>{props.on}</b>
              </span>
            </Show>
          </td>
          <td>
            <Show when={props.on}>
              <span />
            </Show>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
export function Labels(props: { on: boolean }) {
  return (
    <>
      <label>
        <input type="radio" />
        <span>
          <Show when={props.on}>{props.on}</Show>
        </span>
      </label>
      <label>
        <input type="radio" />
      </label>
    </>
  );
}
