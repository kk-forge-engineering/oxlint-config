import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

// oxlint runs with no flags in a folder whose config only extends base.json and solid.json, as a consumer's does.
// So the run also shows that typeAware and denyWarnings reach it through extends, and that solid.json finds the
// plugin from the package's folder.
test('a config that extends both reports each broken rule of the fixture', () => {
  const run = spawnSync('npx', ['oxlint', '--format', 'unix'], {
    cwd: new URL('fixtures', import.meta.url),
    encoding: 'utf8',
  });
  assert.notEqual(run.status, 0, run.stdout + run.stderr);
  for (const rule of [
    'typescript(ban-ts-comment)',
    'eslint(prefer-const)',
    'typescript(no-explicit-any)',
    'typescript(no-floating-promises)',
    'solid(no-innerhtml)',
    'eslint(no-unmodified-loop-condition)',
    'eslint(no-unexpected-multiline)',
    'eslint(no-extend-native)',
    'eslint(preserve-caught-error)',
    'oxc(misrefactored-assign-op)',
    'unicorn(require-post-message-target-origin)',
    'unicorn(no-accessor-recursion)',
    'unicorn(no-array-fill-with-reference-type)',
    'typescript(no-unsafe-enum-comparison)',
    'eslint(no-console)',
  ]) {
    assert.match(run.stdout, new RegExp(rule.replace(/[()]/g, '\\$&')), run.stdout + run.stderr);
  }
});
