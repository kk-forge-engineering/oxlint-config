// This test breaks each vitest rule that configs.test.ts lists.
import { describe, expect, it, vi } from "vitest";

expect(1).toBe(1);
describe(1, () => {
  it("asserts nothing", () => {});
  it("", () => {
    expect(1).toBe(1);
  });
  it("asserts in a branch", () => {
    if (Math.random() > 0.5) {
      expect(1).toBe(1);
    }
  });
  it("leaves a promise unawaited", () => {
    expect(Promise.resolve(1)).resolves.toBe(1);
  });
  it("mocks with no type", () => {
    const send = vi.fn();
    send();
    expect(send).toHaveBeenCalled();
  });
  it("throws anything", () => {
    expect(() => 1).toThrow();
  });
});
