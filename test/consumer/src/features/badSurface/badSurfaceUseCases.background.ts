// The background surface's use cases lack their factory.
export type BadSurfaceBackgroundUseCasesOptions = { retries: number };

export class BadSurfaceBackgroundUseCases {
  private readonly retries: number;

  constructor({ retries }: BadSurfaceBackgroundUseCasesOptions) {
    this.retries = retries;
  }

  attempts(): number {
    return this.retries;
  }
}
