export function crc16_ccitt(buffer: Uint8Array) {
  const POLY = 0x11021; // CRC-CCITT polynomial
  let crc = 0xffff; // Initial value for CRC-CCITT (0xFFFF)

  // Iterate over each byte of the input data
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i] << 8; // XOR the current byte with the CRC

    // Process each bit in the byte
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        // If the leftmost bit is set
        crc = (crc << 1) ^ POLY; // Shift left and XOR with the polynomial
      } else {
        crc <<= 1; // Just shift left if no XOR needed
      }
      crc &= 0xffff; // Ensure CRC is always 16 bits
    }
  }
  return crc;
}
