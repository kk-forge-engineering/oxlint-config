// The use cases hold no JSX, so their file takes .ts.
export type BadTsxUseCasesOptions = { retries: number };

export class BadTsxUseCases {
  private readonly retries: number;

  constructor({ retries }: BadTsxUseCasesOptions) {
    this.retries = retries;
  }

  attempts(): number {
    return this.retries;
  }
}

export function newBadTsxUseCases(options: BadTsxUseCasesOptions): BadTsxUseCases {
  return new BadTsxUseCases(options);
}
