// The class and its factory take a number instead of the options, and the file exports a helper.
export type BadSurfaceUseCasesOptions = { retries: number };

export class BadSurfaceUseCases {
  private readonly retries: number;

  constructor(retries: number) {
    this.retries = retries;
  }

  attempts(): number {
    return this.retries + 1;
  }
}

export function newBadSurfaceUseCases(retries: number): BadSurfaceUseCases {
  return new BadSurfaceUseCases(retries);
}

export const pad = (text: string): string => ` ${text}`;

function trimmed(text: string): string {
  return text.trim();
}

export { trimmed };
