// A feature's use cases: one class, its factory and its options, as features/b/exports.ts gives them out.
export type BUseCasesOptions = { retries: number };

export class BUseCases {
  private readonly retries: number;

  constructor({ retries }: BUseCasesOptions) {
    this.retries = retries;
  }

  attempts(): number {
    return this.retries + 1;
  }
}

// An overload's signature is the factory too.
export function newBUseCases(options: BUseCasesOptions): BUseCases;
export function newBUseCases(options: BUseCasesOptions): BUseCases {
  return new BUseCases(options);
}
