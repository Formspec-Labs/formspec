//! Calculated-field JSON coercion (precision, money wrapping). See [`crate::fel_json`] for JSON→FEL normalization.

use fel_core::Value as TypeValue;

pub(crate) use crate::fel_json::json_to_runtime_fel;
pub(crate) use crate::fel_json::json_to_runtime_fel_typed;

use crate::types::ItemInfo;

pub(crate) fn coerce_calculated_value(item: &ItemInfo, value: TypeValue) -> TypeValue {
    let mut out = value;
    if let Some(precision) = item.precision
        && let TypeValue::Number(n) = out
    {
        out = TypeValue::Number(n.round_dp(precision as u32));
    }

    if item.data_type.as_deref() == Some("money")
        && let TypeValue::Number(amount) = out
    {
        let currency = item.currency.as_deref().unwrap_or_default();
        if let Some(code) = fel_core::CurrencyCode::parse(currency) {
            out = TypeValue::Money(fel_core::Money {
                amount,
                currency: code,
            });
        } else {
            out = TypeValue::Money(fel_core::Money {
                amount,
                currency: fel_core::CurrencyCode::parse("USD")
                    .expect("USD is a valid ISO-4217 currency code"),
            });
        }
    }
    out
}

