import { TLVError } from "../errors";

/** Smallest and largest number of characters a value may hold (EMVCo MPM / VietQR §5.1). */
export const MIN_VALUE_LENGTH = 1;
export const MAX_VALUE_LENGTH = 99;

/**
 * Number of characters in `value`, counted as Unicode code points.
 * This is the unit used by the TLV length header (a surrogate pair counts once).
 */
export function charLength(value: string): number {
  let count = 0;
  for (const _ of value) count++;
  return count;
}

const ID_PATTERN = /^\d{2}$/;

/** Accepts `"00"`–`"99"` or an integer 0–99 and returns the two-digit form. */
export function normalizeId(id: string | number, path: readonly string[] = []): string {
  if (typeof id === "number") {
    if (Number.isInteger(id) && id >= 0 && id <= 99) return String(id).padStart(2, "0");
  } else if (typeof id === "string" && ID_PATTERN.test(id)) {
    return id;
  }
  throw new TLVError("INVALID_ID", `Invalid identifier ${JSON.stringify(id)}; expected "00"-"99"`, path);
}

export function assertValueLength(length: number, path: readonly string[]): void {
  if (length < MIN_VALUE_LENGTH) throw new TLVError("EMPTY_VALUE", "Value must not be empty", path);
  if (length > MAX_VALUE_LENGTH) {
    throw new TLVError("VALUE_TOO_LONG", `Value has ${length} characters; maximum is ${MAX_VALUE_LENGTH}`, path);
  }
}
