import { describe, expect, test } from "vitest";
import { appendCRC, calculateCRC16, crc16, verifyCRC } from "./index";

// Reference values: CRC-16/CCITT-FALSE check value 0x29B1 (reveng CRC catalogue, "CRC-16/IBM-3740");
// all others computed independently with Python's binascii.crc_hqx(data, 0xFFFF).
describe("crc16", () => {
  test("matches the CRC-16/CCITT-FALSE check value", () => {
    expect(crc16("123456789")).toBe(0x29b1);
    expect(crc16(new TextEncoder().encode("123456789"))).toBe(0x29b1);
  });

  test("returns the initial value for empty input", () => {
    expect(crc16("")).toBe(0xffff);
  });

  test("encodes strings as UTF-8", () => {
    expect(calculateCRC16("Đà Nẵng")).toBe("DE5A");
    expect(calculateCRC16("a😀")).toBe("690E");
  });

  test("pads to four upper-case hex digits", () => {
    // Static VietQR with amount "3": CRC 0x0155, which the old implementation emitted as "155".
    const covered = "00020101021138570010A00000072701270006970403011300110123456780208QRIBFTTA5303704540135802VN6304";
    expect(calculateCRC16(covered)).toBe("0155");
  });
});

describe("appendCRC / verifyCRC", () => {
  const spec613 =
    "00020101021238570010A00000072701270006970403011300110123456780208QRIBFTTA530370454061800005802VN62340107NPS68690819thanh toan don hang";

  test("covers the payload plus the 6304 header (VietQR §6.1.3)", () => {
    expect(appendCRC(spec613)).toBe(spec613 + "63042E2E");
  });

  test("verifies valid payloads, case-insensitively", () => {
    expect(verifyCRC(spec613 + "63042E2E")).toBe(true);
    expect(verifyCRC(spec613 + "63042e2e")).toBe(true);
  });

  test("detects modified payloads and checksums", () => {
    expect(verifyCRC(spec613 + "63042E2F")).toBe(false);
    expect(verifyCRC(spec613.replace("180000", "190000") + "63042E2E")).toBe(false);
    expect(verifyCRC(spec613 + "6305" + "2E2E")).toBe(false);
    expect(verifyCRC(spec613 + "6304ZZZZ")).toBe(false);
    expect(verifyCRC("6304")).toBe(false);
  });
});
