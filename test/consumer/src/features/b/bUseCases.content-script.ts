// The use cases of the content-script surface, named for its runtime.
export type BContentScriptUseCasesOptions = { retries: number };

export class BContentScriptUseCases {
  private readonly retries: number;

  constructor({ retries }: BContentScriptUseCasesOptions) {
    this.retries = retries;
  }

  attempts(): number {
    return this.retries;
  }
}

export function newBContentScriptUseCases(
  options: BContentScriptUseCasesOptions,
): BContentScriptUseCases {
  return new BContentScriptUseCases(options);
}
