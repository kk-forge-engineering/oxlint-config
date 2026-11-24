// package.json maps #src/shared/narrow/* into a feature, a narrower key that wins over #src/*.
import { other } from "#src/shared/narrow/bad-other-app";

export const narrow = other;
