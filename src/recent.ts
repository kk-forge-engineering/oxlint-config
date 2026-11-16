// A short-lived cache of what the checks read from disk. Oxlint lints one file at a time, but the
// checks read the files around it.

/** How long the checks reuse what they read: one oxlint run lints every file within moments. */
const lifetimeMilliseconds = 1000;

/**
 * Returns a reader that gives the value read for a key under a second ago, or calls `read` again. The checks of one run
 * so share one read, and a long-lived oxlint, such as the language server, reads again once the value is a second old.
 */
export function newRecent<Value>(): (key: string, read: () => Value) => Value {
  const values = new Map<string, { readAt: number; value: Value }>();
  return (key, read) => {
    const known = values.get(key);
    if (known && performance.now() - known.readAt < lifetimeMilliseconds) {
      return known.value;
    }
    const value = read();
    values.set(key, { readAt: performance.now(), value });
    return value;
  };
}
