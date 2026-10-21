const encoder = /* @__PURE__ */ new TextEncoder();

/**
 * CRC-16/CCITT-FALSE (ISO/IEC 13239): polynomial 0x1021, initial value 0xFFFF,
 * no reflection, no final XOR. Strings are encoded as UTF-8.
 * Check value: `crc16("123456789") === 0x29b1`.
 */
export function crc16(data: string | Uint8Array): number {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]! << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/** CRC-16/CCITT-FALSE of `payload` as four upper-case hex digits (zero-padded). */
export function calculateCRC16(payload: string | Uint8Array): string {
  return crc16(payload).toString(16).toUpperCase().padStart(4, "0");
}

/** The CRC data object header: ID "63", length "04" (EMVCo MPM / VietQR §5.2.15). */
export const CRC_HEADER = "6304";

/**
 * Appends the CRC data object to an encoded payload. The checksum covers every
 * preceding data object plus the `6304` header, but not the checksum itself.
 */
export function appendCRC(payload: string): string {
  const input = payload + CRC_HEADER;
  return input + calculateCRC16(input);
}
