export type VietQRIssueCode =
  /** A mandatory data object is absent. */
  | "MISSING_FIELD"
  /** A value contains characters outside its format (N / ANS). */
  | "INVALID_FORMAT"
  /** A value has the wrong number of characters. */
  | "INVALID_LENGTH"
  /** A value is outside the allowed set or range. */
  | "INVALID_VALUE"
  /** The same identifier appears twice in one template. */
  | "DUPLICATE_FIELD"
  /** Two data objects contradict each other (e.g. ID 56 without ID 55 = "02"). */
  | "CONFLICT"
  /** A data object is in the wrong position or must not be supplied. */
  | "UNEXPECTED_FIELD"
  /** The payload is not well-formed TLV. */
  | "MALFORMED_PAYLOAD"
  /** The CRC is missing, misplaced or does not match. */
  | "INVALID_CRC";

export interface VietQRIssue {
  readonly code: VietQRIssueCode;
  /** Identifiers from the root, e.g. `["62", "08"]`; empty for whole-payload issues. */
  readonly path: readonly string[];
  readonly message: string;
}

/** Raised by VietQR field factories, `encodeVietQR`, `generateVietQR` and `parseVietQR`. */
export class VietQRError extends Error {
  readonly issues: readonly VietQRIssue[];

  constructor(issues: readonly VietQRIssue[]) {
    const [first] = issues;
    const where = first && first.path.length ? ` (at ${first.path.join(".")})` : "";
    const more = issues.length > 1 ? ` (+${issues.length - 1} more)` : "";
    super(`${first ? first.message + where : "Invalid VietQR payload"}${more}`);
    this.name = "VietQRError";
    this.issues = issues;
  }
}

export function throwIfIssues(issues: readonly VietQRIssue[]): void {
  if (issues.length) throw new VietQRError(issues);
}
