//! Subject key rules available to the evaluator without Response selection.

use formspec_core::subject_key::SubjectKey;
use rust_decimal::Decimal;

#[test]
fn subject_key_integer_bounds_agree_for_i64_and_decimal() {
    for (value, expected) in [
        (-9_007_199_254_740_992_i64, false),
        (-9_007_199_254_740_991, true),
        (0, true),
        (9_007_199_254_740_991, true),
        (9_007_199_254_740_992, false),
    ] {
        assert_eq!(SubjectKey::is_integer_in_range(&value), expected);
        assert_eq!(
            SubjectKey::is_integer_in_range(&Decimal::from(value)),
            expected
        );
    }
}
