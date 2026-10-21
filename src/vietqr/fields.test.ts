import { describe, expect, test } from "vitest";
import {
  additionalData,
  countryCode,
  merchantAccount,
  merchantAccountInformation,
  merchantCategoryCode,
  merchantCity,
  merchantName,
  pointOfInitiation,
  postalCode,
  PROMPT,
  removeAccents,
  tipOrConvenienceFee,
  transactionAmount,
  transactionCurrency,
} from "./fields";
import { VietQRError, type VietQRIssueCode } from "./errors";
import { encodeTLV } from "../core/tlv/encode";
import { field } from "../core/tlv/field";

function issueCodes(fn: () => unknown): VietQRIssueCode[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof VietQRError) return error.issues.map((i) => i.code);
    throw error;
  }
  throw new Error("expected VietQRError");
}

describe("merchantAccount (ID 38)", () => {
  test("matches the NAPAS example structure (Table 4 / §5.2.3.2.4)", () => {
    const node = merchantAccount({ acquirerId: "970468", consumerId: "0011009950446", service: "account" });
    expect(encodeTLV([node])).toBe("38570010A00000072701270006970468011300110099504460208QRIBFTTA");
  });

  test("service code is optional and maps card to QRIBFTTC", () => {
    expect(encodeTLV([merchantAccount({ acquirerId: "970403", consumerId: "1" })])).not.toContain("QRIBFTT");
    expect(encodeTLV([merchantAccount({ acquirerId: "970403", consumerId: "1", service: "card" })])).toContain(
      "0208QRIBFTTC",
    );
  });

  test("enforces acquirer length 6 and consumer length ≤ 19", () => {
    expect(issueCodes(() => merchantAccount({ acquirerId: "97040", consumerId: "1" }))).toEqual(["INVALID_LENGTH"]);
    expect(issueCodes(() => merchantAccount({ acquirerId: "970403", consumerId: "1".repeat(20) }))).toEqual([
      "INVALID_LENGTH",
    ]);
    expect(issueCodes(() => merchantAccount({ acquirerId: "970403", consumerId: "" }))).toEqual(["INVALID_LENGTH"]);
    expect(
      issueCodes(() => merchantAccount({ acquirerId: "970403", consumerId: "1", service: "wallet" as "card" })),
    ).toEqual(["INVALID_VALUE"]);
  });

  test("merchantAccountInformation supports other providers' structures", () => {
    const node = merchantAccountInformation(27, "vn.example.wallet", [field("01", "abc")]);
    expect(encodeTLV([node])).toBe("27280017vn.example.wallet0103abc");
    expect(issueCodes(() => merchantAccountInformation(52, "x"))).toEqual(["INVALID_VALUE"]);
    expect(issueCodes(() => merchantAccountInformation(27, "x".repeat(33)))).toEqual(["INVALID_LENGTH"]);
  });
});

describe("simple root fields", () => {
  test("point of initiation", () => {
    expect(pointOfInitiation("static").value).toBe("11");
    expect(pointOfInitiation("dynamic").value).toBe("12");
    expect(issueCodes(() => pointOfInitiation("once" as "static"))).toEqual(["INVALID_VALUE"]);
  });

  test("currency and MCC pad numeric codes", () => {
    expect(transactionCurrency().value).toBe("704");
    expect(transactionCurrency(36).value).toBe("036");
    expect(transactionCurrency("704").value).toBe("704");
    expect(issueCodes(() => transactionCurrency("VND"))).toContain("INVALID_FORMAT");
    expect(issueCodes(() => transactionCurrency(1000))).toEqual(["INVALID_VALUE"]);
    expect(merchantCategoryCode(742).value).toBe("0742");
    expect(issueCodes(() => merchantCategoryCode("51"))).toEqual(["INVALID_LENGTH"]);
  });

  test("country code is ISO 3166-1 alpha-2", () => {
    expect(countryCode().value).toBe("VN");
    expect(issueCodes(() => countryCode("vn"))).toEqual(["INVALID_VALUE"]);
    expect(issueCodes(() => countryCode("VNM"))).toContain("INVALID_LENGTH");
  });

  test("merchant name / city / postal code are ANS with max lengths", () => {
    expect(merchantName("A".repeat(25)).value).toHaveLength(25);
    expect(issueCodes(() => merchantName("A".repeat(26)))).toEqual(["INVALID_LENGTH"]);
    expect(issueCodes(() => merchantCity("Hà Nội"))).toEqual(["INVALID_FORMAT"]);
    expect(merchantCity(removeAccents("Hà Nội")).value).toBe("Ha Noi");
    expect(issueCodes(() => postalCode("12345678901"))).toEqual(["INVALID_LENGTH"]);
  });
});

describe("transactionAmount (ID 54)", () => {
  test.each(["50000", "50000.", "0.5", "1234567890123"])("accepts %s", (value) => {
    expect(transactionAmount(value).value).toBe(value);
  });

  test("converts numbers", () => {
    expect(transactionAmount(180000).value).toBe("180000");
  });

  test.each([
    ["50 000", "INVALID_VALUE"],
    ["0", "INVALID_VALUE"],
    ["0.00", "INVALID_VALUE"],
    ["-1", "INVALID_VALUE"],
    ["1.2.3", "INVALID_VALUE"],
    ["12345678901234", "INVALID_LENGTH"],
  ] as const)("rejects %s", (value, code) => {
    expect(issueCodes(() => transactionAmount(value))).toContain(code);
  });

  test("rejects non-finite and negative numbers, and exponent notation", () => {
    expect(issueCodes(() => transactionAmount(Number.NaN))).toEqual(["INVALID_VALUE"]);
    expect(issueCodes(() => transactionAmount(-5))).toEqual(["INVALID_VALUE"]);
    expect(issueCodes(() => transactionAmount(1e21))).toContain("INVALID_VALUE");
  });
});

describe("tipOrConvenienceFee (IDs 55–57)", () => {
  test("tip", () => {
    expect(tipOrConvenienceFee({ type: "tip" })).toEqual([{ id: "55", value: "01" }]);
  });

  test("fixed fee sets indicator 02 and 56", () => {
    expect(tipOrConvenienceFee({ type: "fixed", value: 5000 })).toEqual([
      { id: "55", value: "02" },
      { id: "56", value: "5000" },
    ]);
  });

  test("percentage fee sets indicator 03 and 57 within 00.01–99.99", () => {
    expect(tipOrConvenienceFee({ type: "percentage", value: "1.5" })[1]).toEqual({ id: "57", value: "1.5" });
    expect(tipOrConvenienceFee({ type: "percentage", value: "00.01" })[1]!.value).toBe("00.01");
    expect(issueCodes(() => tipOrConvenienceFee({ type: "percentage", value: 100 }))).toEqual(["INVALID_VALUE"]);
    expect(issueCodes(() => tipOrConvenienceFee({ type: "percentage", value: "0.001" }))).toEqual(["INVALID_VALUE"]);
    expect(issueCodes(() => tipOrConvenienceFee({ type: "percentage", value: "5%" }))).toEqual(["INVALID_VALUE"]);
  });

  test("rejects unknown types", () => {
    expect(issueCodes(() => tipOrConvenienceFee({ type: "service" } as never))).toEqual(["INVALID_VALUE"]);
  });
});

describe("additionalData (ID 62)", () => {
  test("orders sub-objects by id and supports the *** prompt", () => {
    const node = additionalData({ purposeOfTransaction: "thanh toan", billNumber: PROMPT });
    expect(encodeTLV([node])).toBe("62210103***0810thanh toan");
  });

  test("enforces 25 characters for 01-08 and A/M/E for 09", () => {
    expect(issueCodes(() => additionalData({ purposeOfTransaction: "x".repeat(26) }))).toEqual(["INVALID_LENGTH"]);
    expect(additionalData({ additionalConsumerDataRequest: "AME" }).fields[0]).toEqual({ id: "09", value: "AME" });
    expect(issueCodes(() => additionalData({ additionalConsumerDataRequest: "AA" }))).toEqual(["INVALID_VALUE"]);
    expect(issueCodes(() => additionalData({ additionalConsumerDataRequest: "X" }))).toEqual(["INVALID_VALUE"]);
  });

  test("rejects non-ASCII text instead of transliterating it", () => {
    expect(issueCodes(() => additionalData({ purposeOfTransaction: "thanh toán" }))).toEqual(["INVALID_FORMAT"]);
  });

  test("requires at least one value and keeps extra sub-objects", () => {
    expect(issueCodes(() => additionalData({}))).toEqual(["MISSING_FIELD"]);
    expect(issueCodes(() => additionalData({}, [field("08", "x")]))).toEqual(["INVALID_VALUE"]);
    expect(encodeTLV([additionalData({ billNumber: "1" }, [field("10", "rfu")])])).toBe("6212" + "01011" + "1003rfu");
  });
});

describe("removeAccents", () => {
  test("strips Vietnamese diacritics including đ/Đ", () => {
    expect(removeAccents("Thanh toán đơn hàng ĐÀ NẴNG")).toBe("Thanh toan don hang DA NANG");
  });
});
