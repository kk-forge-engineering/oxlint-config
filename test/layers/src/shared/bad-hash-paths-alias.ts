// tsconfig.json maps #vendor/* outside src/, but the layers read no # alias of paths.
import { vendored } from "#vendor/log";

export const own = vendored;
