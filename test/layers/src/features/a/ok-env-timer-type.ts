// A type that names a timer reads no clock.
export type Later = typeof setTimeout;
export interface Clock {
  setTimeout: typeof setTimeout;
}
