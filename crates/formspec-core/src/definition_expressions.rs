//! Authored FEL expression sites in Definition documents.

use std::collections::HashMap;

use fel_core::exact_json::JsonTree;

use crate::visit_definition_items_from_document;

/// A Bind property that holds a FEL expression.
///
/// Core §3.6.1 defines which Bind properties write the targeted Item's value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum BindProperty {
    /// `calculate`: computes the Item's value.
    Calculate,
    /// `relevant`: decides whether the Item is relevant.
    Relevant,
    /// `required`: decides whether the Item needs an answer.
    Required,
    /// `readonly`: decides whether the Item can be edited.
    Readonly,
    /// `constraint`: validates the Item's value.
    Constraint,
    /// `default` written as `=expr`: the value restored when the Item becomes relevant again.
    Default,
}

/// The expression-bearing Bind properties, in the order they are walked.
const BIND_EXPRESSION_PROPERTIES: &[(&str, BindProperty)] = &[
    ("calculate", BindProperty::Calculate),
    ("relevant", BindProperty::Relevant),
    ("required", BindProperty::Required),
    ("readonly", BindProperty::Readonly),
    ("constraint", BindProperty::Constraint),
];

/// Location and role of an authored FEL expression.
#[derive(Debug, Clone, Copy)]
pub enum ExpressionSite<'a> {
    /// An expression-bearing Bind property.
    Bind(&'a str, BindProperty),
    /// A Shape expression that decides validity.
    Shape(usize, Option<&'a str>),
    /// A Shape context value.
    ShapeContext(Option<&'a str>),
    /// A Definition variable. The name can be missing on an invalid declaration.
    Variable(Option<&'a str>, &'a str),
}

impl<'a> ExpressionSite<'a> {
    /// The Item path or variable scope used to resolve field references.
    pub fn target(self) -> Option<&'a str> {
        match self {
            Self::Bind(target, _) | Self::Variable(Some(_), target) => Some(target),
            Self::Variable(None, _) => None,
            Self::Shape(_, target) | Self::ShapeContext(target) => target,
        }
    }
}

/// Visit every Bind, Shape, and variable expression with its authored JSONPath.
pub fn visit_expressions<V: JsonTree>(
    definition: &V,
    mut visit: impl FnMut(&str, String, ExpressionSite<'_>),
) {
    visit_bind_expressions(definition, &mut visit);
    if let Some(shapes) = definition.get("shapes").and_then(V::as_array) {
        let ids = shapes
            .iter()
            .enumerate()
            .filter_map(|(index, shape)| Some((shape.get("id")?.as_str()?, index)))
            .collect();
        for (index, shape) in shapes.iter().enumerate() {
            let target = shape.get("target").and_then(V::as_str);
            let site = ExpressionSite::Shape(index, target);
            for name in ["constraint", "activeWhen"] {
                if let Some(source) = shape.get(name).and_then(V::as_str) {
                    visit(source, format!("$.shapes[{index}].{name}"), site);
                }
            }
            if let Some(context) = shape.get("context") {
                for (key, value) in context.members() {
                    if let Some(source) = value.as_str() {
                        visit(
                            source,
                            jsonpath_member(&format!("$.shapes[{index}].context"), key),
                            ExpressionSite::ShapeContext(target),
                        );
                    }
                }
            }
            for member in shape_members(shape, &ids) {
                if let ShapeMember::Expression {
                    operator,
                    index: member,
                    source,
                } = member
                {
                    let location = match member {
                        Some(member) => format!("$.shapes[{index}].{operator}[{member}]"),
                        None => format!("$.shapes[{index}].{operator}"),
                    };
                    visit(source, location, site);
                }
            }
        }
    }
    if let Some(variables) = definition.get("variables").and_then(V::as_array) {
        for (index, variable) in variables.iter().enumerate() {
            if let Some(source) = variable.get("expression").and_then(V::as_str) {
                let name = variable.get("name").and_then(V::as_str);
                let scope = variable.get("scope").and_then(V::as_str).unwrap_or("#");
                visit(
                    source,
                    format!("$.variables[{index}].expression"),
                    ExpressionSite::Variable(name, scope),
                );
            }
        }
    }
}

/// Visit active seed predicates at their authored JSONPaths.
pub fn visit_seed_predicates<V: JsonTree>(
    definition: &V,
    as_bool: impl Fn(&V) -> Option<bool>,
    mut visit: impl FnMut(&str, &str),
) {
    // The Item walk is depth-first. Descendants of a repeat cannot seed.
    let mut repeat_children = String::new();
    visit_definition_items_from_document(definition, &mut |item| {
        if !repeat_children.is_empty() && item.json_path.starts_with(&repeat_children) {
            return;
        }
        if item.item.get("type").and_then(V::as_str) != Some("group")
            || item.item.get("repeatable").and_then(&as_bool) != Some(true)
        {
            return;
        }
        repeat_children = format!("{}.children[", item.json_path);
        if let Some(source) = item
            .item
            .get("seedFrom")
            .and_then(|seed| seed.get("where"))
            .and_then(V::as_str)
        {
            visit(source, &format!("{}.seedFrom.where", item.json_path));
        }
    });
}

/// Visit Item creation expressions with their Item paths and authored JSONPaths.
///
/// A string starting with `=` supplies FEL source. Literal initial values are skipped.
pub fn visit_initial_value_expressions<V: JsonTree>(
    definition: &V,
    mut visit: impl FnMut(&str, &str, &str),
) {
    visit_definition_items_from_document(definition, &mut |item| {
        if let Some(source) = item
            .item
            .get("initialValue")
            .and_then(V::as_str)
            .and_then(|value| value.strip_prefix('='))
        {
            visit(
                source,
                &item.dotted_path,
                &format!("{}.initialValue", item.json_path),
            );
        }
    });
}

/// Append a JSON object member without interpreting its key as a path.
fn jsonpath_member(base: &str, key: &str) -> String {
    let mut bytes = key.bytes();
    let simple = bytes
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic() || first == b'_')
        && bytes.all(|byte| byte.is_ascii_alphanumeric() || byte == b'_');
    if simple {
        format!("{base}.{key}")
    } else {
        let quoted = serde_json::to_string(key).expect("JSON member key serializes");
        format!("{base}[{quoted}]")
    }
}

/// Visit authored Bind expressions in a Definition or standalone Screener.
pub fn visit_bind_expressions<V: JsonTree>(
    document: &V,
    mut visit: impl FnMut(&str, String, ExpressionSite<'_>),
) {
    visit_binds(document, |bind, target, location| {
        for &(name, property) in BIND_EXPRESSION_PROPERTIES {
            if let Some(source) = bind.get(name).and_then(V::as_str) {
                visit(
                    source,
                    format!("{location}.{name}"),
                    ExpressionSite::Bind(target, property),
                );
            }
        }
        if let Some(source) = bind
            .get("default")
            .and_then(V::as_str)
            .and_then(|value| value.strip_prefix('='))
        {
            visit(
                source,
                format!("{location}.default"),
                ExpressionSite::Bind(target, BindProperty::Default),
            );
        }
    });
}

/// Visit Bind objects in either supported syntax with their target and JSONPath.
pub fn visit_binds<V: JsonTree>(document: &V, mut visit: impl FnMut(&V, &str, String)) {
    let Some(binds) = document.get("binds") else {
        return;
    };
    if let Some(binds) = binds.as_array() {
        for (index, bind) in binds.iter().enumerate() {
            if let Some(target) = bind.get("path").and_then(V::as_str) {
                visit(bind, target, format!("$.binds[{index}]"));
            }
        }
    } else {
        for (target, bind) in binds.members().filter(|(_, bind)| bind.is_object()) {
            visit(bind, target, jsonpath_member("$.binds", target));
        }
    }
}

/// A composition member resolved according to Core §5.2.2.
pub enum ShapeMember<'a> {
    /// Index of the declared Shape.
    Reference(usize),
    /// An inline expression in a composition.
    Expression {
        /// Name of the composition operator.
        operator: &'static str,
        /// Position for a list-valued operator.
        index: Option<usize>,
        /// Authored FEL source.
        source: &'a str,
    },
}

/// Resolve composition members as Shape ids first, otherwise inline FEL.
pub fn shape_members<'a, V: JsonTree>(
    shape: &'a V,
    ids: &'a HashMap<&'a str, usize>,
) -> impl Iterator<Item = ShapeMember<'a>> {
    ["and", "or", "xone"]
        .into_iter()
        .flat_map(move |op| {
            shape
                .get(op)
                .and_then(V::as_array)
                .into_iter()
                .flatten()
                .enumerate()
                .filter_map(move |(index, value)| {
                    value.as_str().map(|source| (op, Some(index), source))
                })
        })
        .chain(
            shape
                .get("not")
                .and_then(V::as_str)
                .map(|source| ("not", None, source)),
        )
        .map(|(op, index, source)| match ids.get(source) {
            Some(&index) => ShapeMember::Reference(index),
            None => ShapeMember::Expression {
                operator: op,
                index,
                source,
            },
        })
}

/// Visit each FEL interpolation in Definition text slots with its JSONPath.
pub fn visit_template_expressions<V: JsonTree>(
    document: &V,
    mut visit: impl FnMut(&str, Option<&str>, &str),
) {
    let mut check_template = |text: &V, target: Option<&str>, path: &str| {
        if let Some(text) = text.as_str() {
            check_interpolations(text, |expression| visit(expression, target, path));
        }
    };
    visit_binds(document, |bind, target, location| {
        if let Some(message) = bind.get("constraintMessage") {
            check_template(
                message,
                Some(target),
                &format!("{location}.constraintMessage"),
            );
        }
    });
    if let Some(shapes) = document.get("shapes").and_then(V::as_array) {
        for (index, shape) in shapes.iter().enumerate() {
            if let Some(message) = shape.get("message") {
                let target = shape.get("target").and_then(V::as_str);
                check_template(message, target, &format!("$.shapes[{index}].message"));
            }
        }
    }
    visit_definition_items_from_document(document, &mut |ctx| {
        let target = Some(ctx.dotted_path.as_str());
        for name in ["label", "description", "hint"] {
            if let Some(text) = ctx.item.get(name) {
                check_template(text, target, &format!("{}.{name}", ctx.json_path));
            }
        }
        if let Some(labels) = ctx.item.get("labels") {
            for (name, text) in labels.members() {
                check_template(text, target, &format!("{}.labels.{name}", ctx.json_path));
            }
        }
    });
}

/// Visit each unescaped `{{expression}}` in a text slot (Locale §3.3.1).
fn check_interpolations(mut text: &str, mut check: impl FnMut(&str)) {
    while let Some((_, after_open)) = text.split_once("{{") {
        if let Some(after_escape) = after_open.strip_prefix("{{") {
            text = after_escape;
        } else if let Some((expression, rest)) = after_open.split_once("}}") {
            check(expression);
            text = rest;
        } else {
            break;
        }
    }
}
