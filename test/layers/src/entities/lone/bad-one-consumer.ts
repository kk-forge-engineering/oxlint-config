// The rule must flag this entity: only `features/a` counts as its consumer.
// An entrypoint, an infra adapter, a unit test in `orchestration/flow` and a
// test in `tests/` also import it, and the rule does not count them.
export const marker = 1;
