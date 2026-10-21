import { describe, expect, test } from "vitest";
import { appendCRC } from "../core/crc/calculate";
import { field } from "../core/tlv/field";
import { template } from "../core/tlv/template";
import {
  additionalData,
  countryCode,
  encodeVietQR,
  generateVietQR,
  merchantAccount,
  merchantCategoryCode,
  merchantCity,
  merchantName,
  parseVietQR,
  pointOfInitiation,
  postalCode,
  PROMPT,
  tipOrConvenienceFee,
  transactionAmount,
  transactionCurrency,
  validateVietQR,
  VietQRError,
  type VietQRIssueCode,
} from "./index";
import * as F from "./__fixtures__/payloads";

const account = merchantAccount({ acquirerId: "970403", consumerId: "0011012345678", service: "account" });
const card = merchantAccount({ acquirerId: "970403", consumerId: "9704031101234567", service: "card" });
const base = [transactionCurrency(704), countryCode("VN")];

function issueCodes(fn: () => unknown): VietQRIssueCode[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof VietQRError) return error.issues.map((i) => i.code);
    throw error;
  }
  throw new Error("expected VietQRError");
}

describe("encodeVietQR — spec examples (§6.1)", () => {
  test("6.1.1 static to account", () => {
    expect(encodeVietQR([pointOfInitiation("static"), account, ...base])).toBe(F.SPEC_STATIC_ACCOUNT);
  });

  test("6.1.2 static to card", () => {
    expect(encodeVietQR([pointOfInitiation("static"), card, ...base])).toBe(F.SPEC_STATIC_CARD);
  });

  test("6.1.3 dynamic to account", () => {
    const parts = [
      pointOfInitiation("dynamic"),
      account,
      ...base,
      transactionAmount(180000),
      additionalData({ billNumber: "NPS6869", purposeOfTransaction: "thanh toan don hang" }),
    ];
    expect(encodeVietQR(parts)).toBe(F.SPEC_DYNAMIC_ACCOUNT);
  });

  test("6.1.4 dynamic to card", () => {
    const parts = [
      pointOfInitiation("dynamic"),
      card,
      ...base,
      transactionAmount(180000),
      additionalData({ billNumber: "NPS6869", purposeOfTransaction: "thanh toan don hang" }),
    ];
    expect(encodeVietQR(parts)).toBe(F.SPEC_DYNAMIC_CARD);
  });
});

describe("encodeVietQR — composition", () => {
  test("orders root fields by id regardless of input order", () => {
    const shuffled = [countryCode(), account, transactionCurrency(), pointOfInitiation("static")];
    expect(encodeVietQR(shuffled)).toBe(F.SPEC_STATIC_ACCOUNT);
  });

  test("accepts an explicit payload format indicator", () => {
    expect(encodeVietQR([field("00", "01"), pointOfInitiation("static"), account, ...base])).toBe(F.SPEC_STATIC_ACCOUNT);
  });

  test("fees and tip (independent fixtures)", () => {
    expect(
      encodeVietQR([
        pointOfInitiation("dynamic"),
        account,
        ...base,
        transactionAmount(180000),
        tipOrConvenienceFee({ type: "fixed", value: 5000 }),
      ]),
    ).toBe(F.GEN_FIXED_FEE);
    expect(
      encodeVietQR([pointOfInitiation("static"), account, ...base, tipOrConvenienceFee({ type: "percentage", value: 1.5 })]),
    ).toBe(F.GEN_PERCENT_FEE);
    expect(encodeVietQR([pointOfInitiation("static"), account, ...base, tipOrConvenienceFee({ type: "tip" })])).toBe(
      F.GEN_TIP,
    );
  });

  test("merchant fields and additional data (independent fixtures)", () => {
    expect(
      encodeVietQR([
        pointOfInitiation("static"),
        account,
        ...base,
        merchantCategoryCode(5812),
        merchantName("QUAN COM TAM"),
        merchantCity("HA NOI"),
        postalCode("100000"),
      ]),
    ).toBe(F.GEN_MERCHANT);
    expect(
      encodeVietQR([
        pointOfInitiation("dynamic"),
        account,
        ...base,
        transactionAmount("50000"),
        additionalData({
          billNumber: PROMPT,
          referenceLabel: "REF123",
          purposeOfTransaction: "thanh toan",
          additionalConsumerDataRequest: "ME",
        }),
      ]),
    ).toBe(F.GEN_ADDITIONAL);
  });

  test("does not mutate the input array", () => {
    const parts = [countryCode(), account, transactionCurrency(), pointOfInitiation("static")];
    const before = [...parts];
    encodeVietQR(parts);
    expect(parts).toEqual(before);
  });
});

describe("encodeVietQR — validation", () => {
  test("requires mandatory fields", () => {
    expect(issueCodes(() => encodeVietQR([pointOfInitiation("static"), ...base]))).toEqual(["MISSING_FIELD"]);
    expect(issueCodes(() => encodeVietQR([account]))).toEqual(["MISSING_FIELD", "MISSING_FIELD", "MISSING_FIELD"]);
  });

  test("rejects duplicates instead of overwriting", () => {
    expect(issueCodes(() => encodeVietQR([pointOfInitiation("static"), account, ...base, countryCode("SG")]))).toEqual([
      "DUPLICATE_FIELD",
    ]);
  });

  test("rejects a supplied CRC", () => {
    expect(issueCodes(() => encodeVietQR([pointOfInitiation("static"), account, ...base, field("63", "ABCD")]))).toEqual([
      "UNEXPECTED_FIELD",
    ]);
  });

  test("checks fee fields against the indicator", () => {
    const parts = [pointOfInitiation("static"), account, ...base];
    expect(issueCodes(() => encodeVietQR([...parts, field("56", "1000")]))).toEqual(["CONFLICT"]);
    expect(issueCodes(() => encodeVietQR([...parts, field("55", "03"), field("56", "1000")]))).toEqual([
      "CONFLICT",
      "MISSING_FIELD",
    ]);
    expect(issueCodes(() => encodeVietQR([...parts, field("55", "04")]))).toEqual(["INVALID_VALUE"]);
  });

  test("checks amount decimals against the currency exponent", () => {
    const parts = [pointOfInitiation("dynamic"), account, countryCode()];
    expect(issueCodes(() => encodeVietQR([...parts, transactionCurrency(704), transactionAmount("10.50")]))).toEqual([
      "INVALID_VALUE",
    ]);
    expect(encodeVietQR([...parts, transactionCurrency(704), transactionAmount("50000.")])).toContain("540650000.");
    expect(encodeVietQR([...parts, transactionCurrency(702), transactionAmount("10.50")])).toContain("540510.50");
    expect(issueCodes(() => encodeVietQR([...parts, transactionCurrency(702), transactionAmount("10.5")]))).toEqual([
      "INVALID_VALUE",
    ]);
  });

  test("applies the rules to hand-built nodes too", () => {
    expect(
      issueCodes(() => encodeVietQR([pointOfInitiation("static"), account, ...base, field("59", "Quán Cơm")])),
    ).toEqual(["INVALID_FORMAT"]);
    expect(
      issueCodes(() =>
        encodeVietQR([pointOfInitiation("static"), account, ...base, template("62", [field("50", "raw")])]),
      ),
    ).toEqual(["INVALID_FORMAT"]);
    expect(
      issueCodes(() => encodeVietQR([pointOfInitiation("static"), account, ...base, template("80", [field("01", "x")])])),
    ).toEqual(["MISSING_FIELD"]);
  });

  test("reports incomplete NAPAS merchant account information", () => {
    const partial = template("38", [field("00", "A000000727"), template("01", [field("00", "970403")])]);
    expect(issueCodes(() => encodeVietQR([pointOfInitiation("static"), partial, ...base]))).toEqual(["MISSING_FIELD"]);
    // Table 4: ID 38 always carries the NAPAS GUID; other providers use 26–51.
    const other = template("38", [field("00", "vn.example"), template("01", [field("00", "970403"), field("01", "1")])]);
    expect(issueCodes(() => encodeVietQR([pointOfInitiation("static"), other, ...base]))).toEqual(["INVALID_VALUE"]);
  });
});

describe("generateVietQR", () => {
  test("produces the spec examples", () => {
    expect(generateVietQR({ acquirerId: "970403", consumerId: "0011012345678" })).toBe(F.SPEC_STATIC_ACCOUNT);
    expect(generateVietQR({ acquirerId: "970403", consumerId: "9704031101234567", service: "card" })).toBe(
      F.SPEC_STATIC_CARD,
    );
    expect(
      generateVietQR({
        acquirerId: "970403",
        consumerId: "0011012345678",
        initiation: "dynamic",
        amount: 180000,
        purpose: "thanh toan don hang",
        additionalData: { billNumber: "NPS6869" },
      }),
    ).toBe(F.SPEC_DYNAMIC_ACCOUNT);
  });

  test("composes extra fields", () => {
    expect(
      generateVietQR({
        acquirerId: "970403",
        consumerId: "0011012345678",
        fields: [tipOrConvenienceFee({ type: "tip" })],
      }),
    ).toBe(F.GEN_TIP);
  });

  test("rejects conflicting input instead of discarding it", () => {
    expect(
      issueCodes(() =>
        generateVietQR({
          acquirerId: "970403",
          consumerId: "1",
          purpose: "a",
          additionalData: { purposeOfTransaction: "b" },
        }),
      ),
    ).toEqual(["CONFLICT"]);
    expect(
      issueCodes(() => generateVietQR({ acquirerId: "970403", consumerId: "1", fields: [countryCode("SG")] })),
    ).toEqual(["DUPLICATE_FIELD"]);
  });
});

describe("parseVietQR", () => {
  test("extracts values from a spec payload", () => {
    const parsed = parseVietQR(F.SPEC_DYNAMIC_ACCOUNT);
    expect(parsed).toMatchObject({
      payloadFormatIndicator: "01",
      pointOfInitiation: "12",
      initiation: "dynamic",
      merchantAccount: {
        guid: "A000000727",
        acquirerId: "970403",
        consumerId: "0011012345678",
        serviceCode: "QRIBFTTA",
      },
      currency: "704",
      amount: "180000",
      countryCode: "VN",
      additionalData: { billNumber: "NPS6869", purposeOfTransaction: "thanh toan don hang" },
      crc: "2E2E",
    });
    expect(parsed.merchantName).toBeUndefined();
    expect(parsed.nodes.at(-1)).toEqual({ id: "63", value: "2E2E" });
  });

  test("extracts fees, merchant and prompt values", () => {
    expect(parseVietQR(F.GEN_FIXED_FEE)).toMatchObject({ tipOrConvenienceIndicator: "02", convenienceFeeFixed: "5000" });
    expect(parseVietQR(F.GEN_PERCENT_FEE)).toMatchObject({ convenienceFeePercentage: "1.5", initiation: "static" });
    expect(parseVietQR(F.GEN_MERCHANT)).toMatchObject({
      merchantCategoryCode: "5812",
      merchantName: "QUAN COM TAM",
      merchantCity: "HA NOI",
      postalCode: "100000",
    });
    expect(parseVietQR(F.GEN_ADDITIONAL).additionalData).toEqual({
      billNumber: "***",
      referenceLabel: "REF123",
      purposeOfTransaction: "thanh toan",
      additionalConsumerDataRequest: "ME",
    });
  });

  test("preserves unknown data objects", () => {
    const payload = encodeVietQR([
      pointOfInitiation("static"),
      account,
      ...base,
      template("80", [field("00", "vn.example.ext"), field("01", "x")]),
      field("70", "rfu"),
    ]);
    const { nodes } = parseVietQR(payload);
    expect(nodes.find((n) => n.id === "70")).toEqual({ id: "70", value: "rfu" });
    expect(nodes.find((n) => n.id === "80")).toEqual({
      id: "80",
      fields: [
        { id: "00", value: "vn.example.ext" },
        { id: "01", value: "x" },
      ],
    });
  });

  test("rejects a CRC mismatch unless disabled", () => {
    const tampered = F.SPEC_DYNAMIC_ACCOUNT.replace("180000", "980000");
    expect(issueCodes(() => parseVietQR(tampered))).toEqual(["INVALID_CRC"]);
    expect(parseVietQR(tampered, { verifyCRC: false }).amount).toBe("980000");
  });

  test("rejects malformed structure even when the CRC matches (spec §6.1.1 as printed)", () => {
    expect(issueCodes(() => parseVietQR(F.SPEC_STATIC_ACCOUNT_AS_PRINTED))).toEqual(["MALFORMED_PAYLOAD"]);
  });

  test("rejects a missing or misplaced CRC and a misplaced 00", () => {
    expect(issueCodes(() => parseVietQR("000201010211"))).toEqual(["INVALID_CRC"]);
    expect(issueCodes(() => parseVietQR("00020163040000010211"))).toEqual(["INVALID_CRC"]);
    expect(issueCodes(() => parseVietQR("01021100020163041234", { verifyCRC: false }))).toEqual(["UNEXPECTED_FIELD"]);
  });
});

describe("validateVietQR", () => {
  test.each(Object.entries(F).filter(([name]) => name !== "SPEC_STATIC_ACCOUNT_AS_PRINTED"))(
    "%s is valid",
    (_, payload) => {
      expect(validateVietQR(payload)).toEqual({ valid: true, issues: [] });
    },
  );

  test("reports structural and semantic issues without throwing", () => {
    expect(validateVietQR(F.SPEC_STATIC_ACCOUNT_AS_PRINTED).issues.map((i) => i.code)).toEqual(["MALFORMED_PAYLOAD"]);
    expect(validateVietQR("garbage").valid).toBe(false);
    expect(validateVietQR(42 as unknown as string).issues[0]!.code).toBe("MALFORMED_PAYLOAD");
  });

  test("detects field and cross-field violations in a correctly checksummed payload", () => {
    const payload = appendCRC("000201010211530370456041000" + "5802VN" + "5907Quán Ăn");
    const codes = validateVietQR(payload).issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["CONFLICT", "INVALID_FORMAT", "MISSING_FIELD"]));
  });
});
