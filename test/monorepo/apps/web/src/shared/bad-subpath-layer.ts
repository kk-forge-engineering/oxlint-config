// #src/ names this app's own src/, so shared may not import the entrypoint.
import { page } from "#src/entrypoints/page/ok";

export const own = page;
