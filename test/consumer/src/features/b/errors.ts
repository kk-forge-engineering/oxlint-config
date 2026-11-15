// Error classes are part of the feature's contract: one extends Error, the other an error class of the feature.
export class BError extends Error {}

export class BLimitError extends BError {}
