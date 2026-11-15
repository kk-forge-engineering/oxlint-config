// The use cases of the content-script surface, named for its runtime.
export type BContentScriptUseCasesOptions = { retries: number };

export class BContentScriptUseCases {
  private readonly retries: number;

  // An overload's signature comes first, and the check reads the constructor with a body.
  constructor(options: BContentScriptUseCasesOptions);
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
