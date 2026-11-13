// Fixture that the layer check must flag: `orchestration/single` imports
// only one feature, `features/a`. The check ignores the unit test beside
// this file, so its import of `features/b` does not add a second feature.
export const marker = 1;
