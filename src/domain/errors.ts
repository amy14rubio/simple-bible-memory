/**
 * An error the user can fix (an empty title, a missing passage). It carries a `code` so the screen can show it in
 * the user's language; `message` stays English, for logs and tests.
 */
export type ValidationCode = 'deck-title-required' | 'reference-required' | 'verse-text-required';

export class ValidationError extends Error {
  readonly code: ValidationCode;
  constructor(code: ValidationCode, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}
