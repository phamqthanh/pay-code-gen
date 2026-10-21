export type TLVErrorCode =
  /** An identifier is not two decimal digits. */
  | "INVALID_ID"
  /** A value is not a string, or a node is neither a field nor a template. */
  | "INVALID_NODE"
  /** A value or template has no content (length must be at least 1). */
  | "EMPTY_VALUE"
  /** A value is longer than 99 characters. */
  | "VALUE_TOO_LONG"
  /** A length header is not two digits, or is "00". */
  | "INVALID_LENGTH"
  /** The payload ends before a header or value is complete. */
  | "TRUNCATED";

/** Raised by the generic TLV primitives for malformed nodes or payloads. */
export class TLVError extends Error {
  readonly code: TLVErrorCode;
  /** Identifiers from the root to the offending node, e.g. `["62", "08"]`. */
  readonly path: readonly string[];

  constructor(code: TLVErrorCode, message: string, path: readonly string[] = []) {
    super(path.length ? `${message} (at ${path.join(".")})` : message);
    this.name = "TLVError";
    this.code = code;
    this.path = path;
  }
}
