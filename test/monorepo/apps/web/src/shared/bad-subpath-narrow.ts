// package.json maps #/shared/narrow/* into a feature, a narrower key that wins over #/*.
import { other } from "#/shared/narrow/bad-other-app";

export const narrow = other;
