// A local, a parameter or a property named like a browser global is no global, and a type reads nothing.
const location = { pathname: "/" };
export const path = location.pathname;
export const load = (fetch: (url: string) => Promise<unknown>) => fetch("/api");
export const page = (tab: { location: string }) => tab.location;
export type Clipboard = typeof navigator.clipboard;
export interface Http {
  fetch: typeof fetch;
}
