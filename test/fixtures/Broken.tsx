// This code breaks each rule that configs.test.mjs lists, and the test expects every one of them reported.
import "./register";
import { createSignal } from "solid-js";
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
