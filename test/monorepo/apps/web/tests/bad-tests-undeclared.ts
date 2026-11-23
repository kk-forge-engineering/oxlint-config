// package.json declares no "#tests/*": "./tests/*", so #tests/ names nothing.
import { port } from "#tests/helpers";

export const helper = port;
