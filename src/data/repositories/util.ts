import { ValidationError, type ValidationCode } from '../../domain/errors';

export type Clock = () => number;

/** Trim and require non-empty. Validation lives here so every caller gets it. */
export function requireText(value: string, label: string, code: ValidationCode): string {
  const v = value.trim();
  if (!v) throw new ValidationError(code, `${label} is required`);
  return v;
}

export function optionalText(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}
