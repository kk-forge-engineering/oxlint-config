// The constructor keeps the options whole instead of destructuring them.
export type BadIdentifierUseCasesOptions = { retries: number };

export class BadIdentifierUseCases {
  private readonly options: BadIdentifierUseCasesOptions;

  constructor(options: BadIdentifierUseCasesOptions) {
    this.options = options;
  }

  attempts(): number {
    return this.options.retries;
  }
}

export function newBadIdentifierUseCases(
  options: BadIdentifierUseCasesOptions,
): BadIdentifierUseCases {
  return new BadIdentifierUseCases(options);
}
