// This code breaks each rule that configs.test.mjs lists, and the test expects every one of them reported.
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
