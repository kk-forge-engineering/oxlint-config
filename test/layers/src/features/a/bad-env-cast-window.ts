// A cast leaves the global object what it is.
export const load = (window as unknown as { fetch: typeof fetch }).fetch;
