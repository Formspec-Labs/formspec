//! Response `data` arrives nested (Core: non-repeatable groups produce nested objects); the evaluator
//! works on flat dotted paths. This is the one place the two meet.

use std::collections::HashMap;

use serde_json::Value;

use crate::types::ItemInfo;

/// Flatten non-repeatable group objects into dotted-path keys, following the item tree.
///
/// - A key naming a non-repeatable group whose value is an object is replaced by that object's
///   entries at `group.child`, recursively. Field values are never opened (a money field's
///   `{amount, currency}` stays one value), and repeat-group arrays pass through for
///   [`super::augment_nested_data`].
/// - A key that matches no Item is kept at its position, flat or nested: Response `data` allows
///   additional properties (`response.schema.json`), so nothing is dropped.
/// - Flat keys pass through untouched.
///
/// Returns the sorted paths supplied twice (flat and nested, or repeated) as the error: which of
/// the two values is the respondent's answer cannot be decided, so the caller refuses the input.
pub(crate) fn flatten_group_objects(
    items: &[ItemInfo],
    data: &HashMap<String, Value>,
) -> Result<HashMap<String, Value>, Vec<String>> {
    let mut out = HashMap::with_capacity(data.len());
    let mut conflicts = Vec::new();
    place(items, data.iter(), "", &mut out, &mut conflicts);
    if conflicts.is_empty() {
        Ok(out)
    } else {
        conflicts.sort();
        conflicts.dedup();
        Err(conflicts)
    }
}

fn place<'a>(
    siblings: &[ItemInfo],
    entries: impl Iterator<Item = (&'a String, &'a Value)>,
    prefix: &str,
    out: &mut HashMap<String, Value>,
    conflicts: &mut Vec<String>,
) {
    let by_key: HashMap<&str, &ItemInfo> = siblings.iter().map(|i| (i.key.as_str(), i)).collect();
    for (key, value) in entries {
        if let (Some(item), Value::Object(map)) = (by_key.get(key.as_str()), value)
            && item.item_type == "group"
            && !item.repeatable
        {
            place(&item.children, map.iter(), &format!("{prefix}{key}."), out, conflicts);
            continue;
        }
        let path = format!("{prefix}{key}");
        if out.insert(path.clone(), value.clone()).is_some() {
            conflicts.push(path);
        }
    }
}
