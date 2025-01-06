# @pahm/pay-code-gen

A package to generate pay codes for fast money transfers in the VietQR format.
This package allows you to easily construct the content for payment QR codes using a builder pattern.

## Features

- **Generate Pay Codes:** Create pay codes based on VietQR standards.
- **Builder Pattern:** Use a builder pattern to fluently construct pay codes.

## Installation

To install the package, you can use npm, yarn or pnpm:

```bash
npm install @pahm/pay-code-gen
# or
yarn add @pahm/pay-code-gen
# or
pnpm i @pahm/pay-code-gen
```

## Usage

This package provides a PayCodeGen class that implements the builder pattern.
You can fluently build a pay code with the required fields and then generate the final pay code string.

### Example

Static QR code with an account and content:

```ts
import PayCodeGen from "@pahm/pay-code-gen";

// Create a new pay code instance
const payCode = new PayCodeGen()
  .acquirer("970403") // set the acquirer id (bin)
  .cosumer("0011012345678") // set the cosumer account id
  .cosumerType("A") // set type account ("A" as Account)
  .currency(704) // set the currency (Vietnamese Dong)
  .country("VN") // default is VN (default)
  .content("any content"); // add content for transaction

// Get the final pay code string
console.log(payCode.toString());
```

Static QR code to card with content:

```ts
import PayCodeGen from "@pahm/pay-code-gen";

// Create a new pay code instance
const payCode = new PayCodeGen()
  .acquirer("970403") // set the acquirer id (bin)
  .cosumer("9704031101234567") // set the cosumer card id
  .cosumerType("C") // set type account ("C" as card)
  .currency(704) // set the currency (Vietnamese Dong)
  .country("VN") // default is VN (default)
  .content("any content"); // add content for transaction

// Get the final pay code string
console.log(payCode.toString());
```

### Methods Summary

#### `acquirer(id)`: Sets the acquirer ID (e.g., the merchant ID).

#### `consumer(data)`: Sets the consumer data.

#### `currency(currency)`: Sets the currency using the ISO 4217 code (default is Vietnamese Dong `704`).

#### `amount(value)`: Sets the payment amount.

#### `country(countryCode)`: Sets the country code (default is `"VN"` for Vietnam).

#### `category(catId)`: Sets the category ID (e.g., "001").

#### `tip()`: Sets a fixed tip, removing fee-related fields.

#### `fixedFee(value)`: Sets a fixed fee, removing percentage fee and amount.

#### `percentFee(value)`: Sets a percentage fee, removing the fixed fee and amount.

#### `bankName(name)`: Sets the bank name.

#### `city(name)`: Sets the city name.

#### `portal(code)`: Sets the portal code (e.g., "100000").

#### `additional(id, content)`: Adds additional content with the given ID (e.g., custom information).

##### `id`

- `BILL_NUMBER`: Invoice/receipt number issued by Merchant or automatically entered by the Customer Application
- `MOBILE_NUMBER`: The mobile phone number can be provided by the merchant or entered by the customer.
- `STORE_LABEL`: A special value associated with a store. This value can be provided by the merchant or entered by the customer.
- `LOYALTY_NUMBER`: Usually the loyalty card number. This number may be provided by the merchant or the customer may have to enter their Loyalty Card Number.
- `REFERENCE_LABEL`:
- `CUSTOMER_LABEL`: Can be customer code, customer phone number, invoice number.
- `TERMINAL_LABEL`: A unique code associated with the store's terminal.
- `PURPOSE_OF_TRANSACTION`: Value to determine the purpose of the transaction, eg: phone top-up, purchase of goods...
- `ADDITIONAL_CONSUMER_DATA_REQUEST`: One or more of the following characters may appear, indicating the corresponding data that needs to be provided during transaction initiation:
  - "A" = Customer address
  - "M" = Customer phone number
  - "E" = Customer email address

#### `content(content)`: Adds content to the pay code. This is a more general method for adding content.

## Acknowledgements

This package follows the VietQR standards for generating payment QR codes, which are widely used for fast and secure mobile payments in Vietnam.
