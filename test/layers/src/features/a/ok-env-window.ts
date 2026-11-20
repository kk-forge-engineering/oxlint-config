// A local named window is no global object, so what it holds reads nothing.
const window = { location: { pathname: "/" }, setTimeout: (run: () => void) => run() };
export const path = window.location.pathname;
export const later = window.setTimeout(() => undefined);
export const at = (self: { fetch: () => number }) => self.fetch();
