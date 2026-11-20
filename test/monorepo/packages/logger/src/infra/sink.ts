/** Returns the current time in milliseconds since the Unix epoch. */
export const sink = () => Date.now();
// A package's infra may do I/O: only the environment comes from the composition root.
export const send = () => fetch("/log");
