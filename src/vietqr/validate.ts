import type { VietQRIssue } from "./errors";
import { decodeVietQR } from "./parse";
import { validateNodes } from "./validate-nodes";

export interface VietQRValidationResult {
  readonly valid: boolean;
  readonly issues: readonly VietQRIssue[];
}

/**
 * Validates a complete VietQR string: TLV syntax, CRC, mandatory fields, every field rule,
 * and cross-field rules (fee indicator vs. fee values, amount decimals vs. currency,
 * duplicate ids, GUID templates). Never throws for invalid input.
 */
export function validateVietQR(payload: string): VietQRValidationResult {
  const decoded = decodeVietQR(payload, true);
  const issues = decoded.nodes.length
    ? [...decoded.issues, ...validateNodes(decoded.nodes, { requireMandatory: true, crc: "required" })]
    : decoded.issues;
  return { valid: issues.length === 0, issues };
}
