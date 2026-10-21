import { describe, expect, test } from "vitest";
import PayCodeGen, { BILL_NUMBER, encodeVietQR, generateVietQR, PayCodeGen as Named, VietQRError } from "../index";
import {
  countryCode,
  merchantAccount,
  merchantCity,
  merchantName,
  pointOfInitiation,
  postalCode,
  tipOrConvenienceFee,
  transactionAmount,
  transactionCurrency,
} from "../vietqr/fields";
import * as F from "../vietqr/__fixtures__/payloads";

describe("legacy PayCodeGen ≡ functional API", () => {
  test("default and named exports are the same class", () => {
    expect(PayCodeGen).toBe(Named);
  });

  test("static account", () => {
    const legacy = new PayCodeGen().acquirer("970403").cosumer("0011012345678").cosumerType("A").toString();
    expect(legacy).toBe(generateVietQR({ acquirerId: "970403", consumerId: "0011012345678" }));
    expect(legacy).toBe(F.SPEC_STATIC_ACCOUNT);
  });

  test("dynamic card with additional data", () => {
    const legacy = new PayCodeGen()
      .dynamic()
      .acquirer("970403")
      .cosumer("9704031101234567")
      .cosumerType("C")
      .amount(180000)
      .additional(BILL_NUMBER, "NPS6869")
      .content("thanh toán đơn hàng")
      .toString();
    expect(legacy).toBe(
      generateVietQR({
        acquirerId: "970403",
        consumerId: "9704031101234567",
        service: "card",
        initiation: "dynamic",
        amount: 180000,
        purpose: "thanh toan don hang",
        additionalData: { billNumber: "NPS6869" },
      }),
    );
    expect(legacy).toBe(F.SPEC_DYNAMIC_CARD);
  });

  test("merchant fields", () => {
    const legacy = new PayCodeGen()
      .acquirer("970403")
      .cosumer("0011012345678")
      .cosumerType()
      .category(5812)
      .bankName("QUAN COM TAM")
      .city("HA NOI")
      .portal("100000")
      .toString();
    expect(legacy).toBe(F.GEN_MERCHANT);
  });

  test("fees now emit the indicator, keep the amount and chain", () => {
    const fixed = new PayCodeGen()
      .dynamic()
      .acquirer("970403")
      .cosumer("0011012345678")
      .cosumerType()
      .amount(180000)
      .fixedFee(5000)
      .toString();
    expect(fixed).toBe(F.GEN_FIXED_FEE);
    expect(fixed).toBe(
      encodeVietQR([
        pointOfInitiation("dynamic"),
        merchantAccount({ acquirerId: "970403", consumerId: "0011012345678", service: "account" }),
        transactionCurrency(),
        countryCode(),
        transactionAmount(180000),
        tipOrConvenienceFee({ type: "fixed", value: 5000 }),
      ]),
    );
    const base = () => new PayCodeGen().acquirer("970403").cosumer("0011012345678").cosumerType();
    expect(base().percentFee(1.5).toString()).toBe(F.GEN_PERCENT_FEE);
    expect(base().fixedFee(1000).tip().toString()).toBe(F.GEN_TIP);
    expect(base().tip().percentFee(1.5).toString()).toBe(F.GEN_PERCENT_FEE);
  });

  test("pads the CRC to four characters (amount 3 → CRC 0155)", () => {
    const code = new PayCodeGen().acquirer("970403").cosumer("0011012345678").cosumerType().amount(3).toString();
    expect(code.slice(-8)).toBe("63040155");
  });

  test("still allows payloads without merchant account information", () => {
    expect(new PayCodeGen().dynamic().category("5139").toString()).toBe("00020101021252045139530370458" + "02VN6304E5C7");
  });

  test("skips empty values and strips accents including đ", () => {
    const code = new PayCodeGen().acquirer("970403").cosumer("1").content("").additional(1, "Đơn 1").toString();
    expect(code).toContain("62090105Don 1");
    expect(code).not.toContain("0800");
  });

  test("validation errors are raised instead of producing corrupt payloads", () => {
    expect(() => new PayCodeGen().amount("50 000")).toThrow(VietQRError);
    expect(() => new PayCodeGen().bankName("Quán Cơm")).toThrow(VietQRError);
    expect(() => new PayCodeGen().city("x".repeat(16))).toThrow(VietQRError);
    expect(() => new PayCodeGen().content("x".repeat(26)).toString()).toThrow(VietQRError);
    expect(() => new PayCodeGen().acquirer("97040").toString()).toThrow(VietQRError);
  });

  test("currency numbers are zero-padded", () => {
    expect(new PayCodeGen().currency(36).toString()).toContain("5303036");
  });

  test("merchant field helpers agree with the builder", () => {
    expect(merchantName("A").value).toBe("A");
    expect(merchantCity("B").value).toBe("B");
    expect(postalCode("C").value).toBe("C");
  });
});

describe("docs/migration.md examples", () => {
  test("high-level and composed versions are identical", async () => {
    const { additionalData, encodeVietQR, generateVietQR, removeAccents } = await import("../vietqr/index");
    const a = generateVietQR({
      acquirerId: "970403",
      consumerId: "9704031101234567",
      service: "card",
      initiation: "dynamic",
      amount: 180000,
      purpose: removeAccents("thanh toán đơn hàng"),
      additionalData: { billNumber: "NPS6869" },
    });
    const b = encodeVietQR([
      pointOfInitiation("dynamic"),
      merchantAccount({ acquirerId: "970403", consumerId: "9704031101234567", service: "card" }),
      transactionCurrency(704),
      transactionAmount(180000),
      countryCode("VN"),
      additionalData({ billNumber: "NPS6869", purposeOfTransaction: "thanh toan don hang" }),
    ]);
    expect(a).toBe(b);
    expect(a).toBe(F.SPEC_DYNAMIC_CARD);
  });

  test("README quick start shape", async () => {
    const { generateVietQR } = await import("../vietqr/index");
    const payload = generateVietQR({
      acquirerId: "970403",
      consumerId: "0011012345678",
      initiation: "dynamic",
      amount: 180000,
      purpose: "thanh toan don hang",
    });
    expect(payload).toMatch(/^00020101021238570010A000000727.*5802VN62230819thanh toan don hang6304[0-9A-F]{4}$/);
  });
});
