# Exact JSON numbers in evaluator responses

Decimal fields use JSON numbers. A calculation such as `1 / 3` produces
`0.3333333333333333333333333333`, without quotes. Money retains its different
schema: `{"amount":"0.3333333333333333333333333333","currency":"USD"}`.
The formula is unchanged; no rounding is added to make validation pass.

## JavaScript

The engine uses the maintained `parseJsonExact` reader from
`@formspec-org/integrity-canonical`. Numeric values whose decimal value survives
a JavaScript JSON round trip use ordinary numbers. Other numeric values use immutable `JSON.rawJSON` leaves;
`JSON.stringify` writes their exact digits as JSON numbers.

```typescript
import { cloneJsonValue, jsonNumberText } from '@formspec-org/engine/render';
import { parseJsonExact } from '@formspec-org/integrity-canonical';

const { response, validationReport } = engine.getResponseSnapshot({ profile: 'on-submit' });
const text = JSON.stringify(response);
const restored = parseJsonExact(text);
const detached = cloneJsonValue(response);
const displayedRatio = jsonNumberText(response.data.ratio);
```

Use the exact reader on persisted JSON and HTTP response text, and the exact
clone for response-bearing application state. Ordinary `JSON.parse`,
`structuredClone`, `Number`, and `parseFloat` cannot preserve these values.
Pass numeric text from editable controls to `engine.setValue`; use FEL for
arithmetic. `getResponseSnapshot` returns response data and validation from one
evaluation and clock reading. `getResponse` uses the same response builder.

Numeric-looking strings remain strings at the batch evaluation boundary. An
ordinary object such as `{"rawJSON":"1.2"}` or `{"$type":"number","value":"1.2"}`
does not become a number. Recognize genuine numeric leaves with
`jsonNumberText`, not by inspecting object property names.

## Python

The Python evaluator returns fractional values as `decimal.Decimal` and integers
as `int`. Extension callbacks receive these types too. Use `formspec.json` for
read-back and writing; it uses `msgspec` to emit Decimal values as JSON numbers.

```python
from formspec import json
from formspec._rust import evaluate_definition

result = evaluate_definition(definition, json.loads(saved_data))
saved_data = json.dumps(result.data)
```

The writer rejects nonfinite numbers, non-string object keys, and objects that
are not JSON values. Standard `json.dumps` cannot encode Decimal without a
custom conversion, and converting Decimal to float or string changes the value
or its JSON type.

## Rust and supported range

Evaluator inputs and outputs use `fel_core::exact_json::Value`, reexported by
`formspec_eval::exact_json`. Parse original JSON text with `exact_json::from_str`
and serialize through serde normally. Its numeric variant owns a validated
`serde_json::value::RawValue`; no global `arbitrary_precision` feature or
object-marker interpretation is required. `exact_json::to_value` retains exact
values in typed structs. `native_json!` is only for ordinary Rust literals;
converting an already-parsed `serde_json::Value` cannot recover lost digits.

The transport preserves numeric tokens. Evaluation remains bounded by
`rust_decimal::Decimal`: a 96-bit coefficient and scale up to 28. Values outside
that range produce an explicit precision/range error instead of silent input
rounding. Decimal arithmetic retains its existing finite-precision behavior.
Authored field precision still applies its requested rounding.

`evaluate_screener_document` now returns `Result`, allowing callers to handle
unsupported numeric input. Native form evaluation reports rejected input through
`TYPE_MISMATCH`; JavaScript entry points throw for unsupported raw numbers.
Invalid text entered through controls stays in the model and fails validation.

This change covers form evaluation, coercion, instances, extension callbacks,
response migration, response assembly, Mapping `preserve` execution and JSON/CSV/XML
serialization, and the updated browser render and review consumers.
Non-`preserve` Mapping arithmetic/coercions, screener score-threshold arithmetic
(which still uses binary floats), and legacy server ports that already receive
parsed numeric views remain separate limits. These changes cannot restore digits
previously lost in storage or a caller's float conversion. Local checks do not
establish a hosted deployment or qualify every native signing/history path.
