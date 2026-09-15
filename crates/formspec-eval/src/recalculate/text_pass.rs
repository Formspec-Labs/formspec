//! Item text pass: label, labels, description, and hint per Item instance (Core §4.2.1).
//!
//! Runs as the last recalculate walk, so each `{{expression}}` sees settled values,
//! variables, MIP state, and the Item's repeat-instance scope, like a `calculate`.

use std::collections::{BTreeSet, HashMap};

use fel_core::FormspecEnvironment;
use formspec_core::{DefinitionItemKeyPolicy, visit_definition_items_json_with_policy};
use serde_json::Value as JsonValue;

use super::walk::{Visit, Walk};
use crate::interpolation::interpolate_fel;
use crate::types::{
    ItemInfo, ItemText, ItemTextRequest, resolve_qualified_repeat_refs, strip_indices,
};

/// A Definition Item's inline text properties.
#[derive(Default)]
struct InlineText {
    /// `label`.
    label: Option<String>,
    /// `labels` by context.
    labels: HashMap<String, String>,
    /// `description`.
    description: Option<String>,
    /// `hint`.
    hint: Option<String>,
}

impl InlineText {
    /// Reads the text properties of Definition Item `item`.
    fn of(item: &JsonValue) -> Self {
        let text = |property: &str| {
            item.get(property)
                .and_then(JsonValue::as_str)
                .map(str::to_string)
        };
        Self {
            label: text("label"),
            labels: item
                .get("labels")
                .and_then(JsonValue::as_object)
                .into_iter()
                .flatten()
                .filter_map(|(context, label)| Some((context.clone(), label.as_str()?.to_string())))
                .collect(),
            description: text("description"),
            hint: text("hint"),
        }
    }
}

/// Collects [`ItemText`] for every Item the walk visits.
pub(super) struct TextPass<'a> {
    /// Locale strings to prefer over inline text.
    request: &'a ItemTextRequest,
    /// Inline text by un-indexed dotted Item path.
    sources: HashMap<String, InlineText>,
    /// Locale `<property>@<context>` contexts by Item key then property, gathered once.
    locale_contexts: HashMap<&'a str, HashMap<&'a str, BTreeSet<&'a str>>>,
    /// Resolved text by instance path.
    pub(super) text: HashMap<String, ItemText>,
}

impl<'a> TextPass<'a> {
    /// Indexes `definition` Items and `request` Locale context keys once: O(items + strings).
    pub(super) fn new(definition: &'a JsonValue, request: &'a ItemTextRequest) -> Self {
        let mut sources = HashMap::new();
        if let Some(items) = definition.get("items").and_then(JsonValue::as_array) {
            visit_definition_items_json_with_policy(
                items,
                "$.items",
                None,
                DefinitionItemKeyPolicy::CoerceNonStringKeyToEmpty,
                &mut |ctx| {
                    sources.insert(ctx.dotted_path.clone(), InlineText::of(ctx.item));
                },
            );
        }
        // Locale §3.1.2: `@context` applies to every text property, not just `label`.
        let mut locale_contexts: HashMap<&str, HashMap<&str, BTreeSet<&str>>> = HashMap::new();
        for key in request.locale_strings.keys() {
            if let Some((item_and_property, context)) = key.split_once('@')
                && let Some((item_key, property)) = item_and_property.rsplit_once('.')
            {
                locale_contexts
                    .entry(item_key)
                    .or_default()
                    .entry(property)
                    .or_default()
                    .insert(context);
            }
        }
        Self {
            request,
            sources,
            locale_contexts,
            text: HashMap::new(),
        }
    }
}

impl Visit for TextPass<'_> {
    type Inherited = ();

    fn item(
        &mut self,
        walk: &Walk<'_>,
        item: &mut ItemInfo,
        env: &mut FormspecEnvironment,
        _values: &mut HashMap<String, JsonValue>,
        (): (),
    ) {
        let Some(inline) = self.sources.get(&strip_indices(&item.path)) else {
            return;
        };
        let env = &*env;
        let interpolate = |template: &str| {
            interpolate_fel(template, env, walk.fel, |expression| {
                resolve_qualified_repeat_refs(expression, &item.path)
            })
            .text
        };
        let locale = |property: &str| {
            self.request
                .locale_strings
                .get(&format!("{}.{property}", item.key))
                .map(String::as_str)
        };

        let by_property = self.locale_contexts.get(item.key.as_str());
        let locale_contexts = |property: &str| {
            by_property
                .and_then(|properties| properties.get(property))
                .into_iter()
                .flatten()
                .copied()
        };

        // Locale §3.1.2 cascade per context: Locale `label@context` → Locale `label` →
        // Definition `labels[context]` → Definition `label`.
        let mut label_contexts: BTreeSet<&str> = inline.labels.keys().map(String::as_str).collect();
        label_contexts.extend(locale_contexts("label"));
        let labels = label_contexts
            .into_iter()
            .map(|context| {
                let template = locale(&format!("label@{context}"))
                    .or_else(|| locale("label"))
                    .or_else(|| inline.labels.get(context).map(String::as_str))
                    .or(inline.label.as_deref())
                    .unwrap_or_default();
                (context.to_string(), interpolate(template))
            })
            .collect();

        // Same cascade minus the Definition-side context step: `hint` and `description` have no
        // `labels`-like sibling, so a context with no Locale `@context` key resolves to the
        // context-less value and is left out.
        let contextual = |property: &str, fallback: Option<&str>| -> HashMap<String, String> {
            locale_contexts(property)
                .filter_map(|context| {
                    let template = locale(&format!("{property}@{context}"))
                        .or_else(|| locale(property))
                        .or(fallback)?;
                    Some((context.to_string(), interpolate(template)))
                })
                .collect()
        };

        let text = ItemText {
            label: interpolate(
                locale("label")
                    .or(inline.label.as_deref())
                    .unwrap_or_default(),
            ),
            labels,
            descriptions: contextual("description", inline.description.as_deref()),
            description: locale("description")
                .or(inline.description.as_deref())
                .map(interpolate),
            hints: contextual("hint", inline.hint.as_deref()),
            hint: locale("hint").or(inline.hint.as_deref()).map(interpolate),
        };
        self.text.insert(item.path.clone(), text);
    }
}
