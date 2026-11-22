// A key computed from a name, a key that only resembles one, and a type's member set no HTML.
const key = "html";
export const shapes = (text: string) => ({ [key]: text, innerText: text, textContent: text, inner: { html: text } });
export type Markup = { innerHTML: string };
// A local named Reflect is no global.
const Reflect = { set: (_node: object, _key: string, _value: string) => true };
export const local = (node: HTMLElement, text: string) => Reflect.set(node, "innerHTML", text);
