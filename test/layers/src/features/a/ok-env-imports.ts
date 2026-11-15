// The command line is the entrypoint's own, and a type reads nothing.
import process from "node:process";
import type { Stats } from "node:fs";
import { createHash } from "node:crypto";
export const args = process.argv;
export type { Stats };
export { createHash };
