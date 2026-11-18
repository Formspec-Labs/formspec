//! Reads extracted from parsed FEL before resolving each evaluation site.

use fel_core::{Expr, ast::PathSegment};

/// The point from which a FEL value read is resolved.
#[derive(Debug)]
pub enum Root {
    /// A lexical Item name.
    Field(String),
    /// The expression's own target.
    Target,
    /// The current repeat row.
    Current,
    /// The previous repeat row.
    Previous,
    /// The next repeat row.
    Next,
    /// The containing row or group.
    Parent,
}

/// A field or row reference, with its parsed path kept intact.
#[derive(Debug)]
pub struct Read {
    /// The lexical reference root.
    pub root: Root,
    /// FEL selectors and members after the root.
    pub path: Vec<PathSegment>,
    /// The operation can read just row count when this path names a repeat array.
    pub row_count: bool,
}

/// The model-item property addressed by a FEL query.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Property {
    /// The `required()` query.
    Required,
    /// The `relevant()` query.
    Relevant,
    /// The `readonly()` query.
    Readonly,
    /// The `valid()` query.
    Valid,
}

/// Data or state needed by a model-item property query.
#[derive(Debug, Clone, Copy)]
pub enum PropertyInput {
    /// The target Item's value.
    Value,
    /// A property inherited through the Item and its ancestors.
    Inherited(Property),
    /// A property on the target Item itself.
    Own(Property),
    /// The target Item's constraint expression.
    Constraint,
    /// Error-severity Shapes targeting this Item.
    ErrorShapes,
}

impl Property {
    /// Return the Core dependencies of a model-item property query.
    pub fn inputs(self) -> &'static [PropertyInput] {
        use PropertyInput::{Constraint, ErrorShapes, Inherited, Own, Value};
        match self {
            Self::Relevant => &[Inherited(Self::Relevant)],
            Self::Readonly => &[Inherited(Self::Readonly)],
            Self::Required => &[Own(Self::Required), Inherited(Self::Relevant)],
            Self::Valid => &[
                Value,
                Own(Self::Required),
                Inherited(Self::Relevant),
                Constraint,
                ErrorShapes,
            ],
        }
    }
}

/// Instance values, Definition variables and model-item properties read by FEL.
#[derive(Debug, Default)]
pub struct Reads {
    /// Instance values read by the expression.
    pub values: Vec<Read>,
    /// Definition variables read by name, before lexical scope resolution.
    pub variables: Vec<String>,
    /// Model-item properties queried and their targets.
    pub properties: Vec<(Property, Read)>,
    predicate_values: Vec<Vec<PathSegment>>,
}

impl Reads {
    /// Extract reads, accounting for local variables and predicate scope.
    pub fn new(expr: &Expr) -> Self {
        let mut reads = Self::default();
        reads.visit(expr, &mut Vec::new(), false, &[]);
        reads
    }

    fn visit<'a>(
        &mut self,
        expr: &'a Expr,
        locals: &mut Vec<&'a str>,
        predicate: bool,
        suffix: &[PathSegment],
    ) {
        let root = match expr {
            Expr::FieldRef { name: None, .. } if predicate => {
                let path = extend_path(segments(expr), suffix);
                self.predicate_values.push(path);
                return;
            }
            Expr::FieldRef { name: None, .. } => Some(Root::Target),
            Expr::FieldRef {
                name: Some(name), ..
            }
            | Expr::VarRef { name, .. }
                if !locals.contains(&name.as_str()) =>
            {
                Some(Root::Field(name.clone()))
            }
            Expr::ContextRef { name, .. } if name == "current" => Some(Root::Current),
            Expr::ContextRef { name, .. } => {
                if !matches!(name.as_str(), "index" | "count" | "instance") {
                    self.variables.push(name.clone());
                }
                return;
            }
            Expr::FunctionCall { name, args } if args.is_empty() => match name.as_str() {
                "prev" => Some(Root::Previous),
                "next" => Some(Root::Next),
                "parent" => Some(Root::Parent),
                _ => None,
            },
            _ => None,
        };
        if let Some(root) = root {
            self.values.push(Read {
                root,
                path: extend_path(segments(expr), suffix),
                row_count: false,
            });
            return;
        }
        match expr {
            Expr::PostfixAccess { expr, path } => {
                let path: Vec<_> = path.iter().chain(suffix).cloned().collect();
                self.visit(expr, locals, predicate, &path);
            }
            Expr::RowLookup {
                source,
                key_path,
                key,
            } => {
                self.visit(key, locals, predicate, &[]);
                let wildcard = std::iter::once(PathSegment::Wildcard);
                let key: Vec<_> = wildcard
                    .clone()
                    .chain(key_path.iter().cloned().map(PathSegment::Dot))
                    .collect();
                self.visit(source, locals, predicate, &key);
                let selected: Vec<_> = wildcard.chain(suffix.iter().cloned()).collect();
                self.visit(source, locals, predicate, &selected);
            }
            Expr::LetBinding { name, value, body } => {
                self.visit(value, locals, predicate, &[]);
                locals.push(name);
                self.visit(body, locals, predicate, suffix);
                locals.pop();
            }
            Expr::FunctionCall { name, args } => self.call(name, args, locals, predicate),
            _ => {
                let mut visit = |child| self.visit(child, locals, predicate, &[]);
                match expr {
                    Expr::Array(items) => items.iter().for_each(visit),
                    Expr::Object(entries) => entries.iter().for_each(|(_, value)| visit(value)),
                    Expr::UnaryOp { operand, .. } => visit(operand),
                    Expr::BinaryOp { left, right, .. } | Expr::NullCoalesce { left, right } => {
                        visit(left);
                        visit(right);
                    }
                    Expr::Membership {
                        value, container, ..
                    } => {
                        visit(value);
                        visit(container);
                    }
                    Expr::Ternary {
                        condition,
                        then_branch,
                        else_branch,
                    }
                    | Expr::IfThenElse {
                        condition,
                        then_branch,
                        else_branch,
                    } => {
                        visit(condition);
                        visit(then_branch);
                        visit(else_branch);
                    }
                    Expr::Null
                    | Expr::Boolean(_)
                    | Expr::Number(_)
                    | Expr::String(_)
                    | Expr::DateLiteral(_)
                    | Expr::DateTimeLiteral(_)
                    | Expr::FieldRef { .. }
                    | Expr::VarRef { .. } => {}
                    // Reference, postfix, and call forms are handled above.
                    Expr::ContextRef { .. }
                    | Expr::PostfixAccess { .. }
                    | Expr::RowLookup { .. }
                    | Expr::LetBinding { .. }
                    | Expr::FunctionCall { .. } => unreachable!(),
                }
            }
        }
    }

    fn call<'a>(
        &mut self,
        name: &str,
        args: &'a [Expr],
        locals: &mut Vec<&'a str>,
        predicate: bool,
    ) {
        match (name, args) {
            ("valid" | "relevant" | "readonly" | "required", [arg]) => {
                let property = match name {
                    "valid" => Property::Valid,
                    "relevant" => Property::Relevant,
                    "readonly" => Property::Readonly,
                    _ => Property::Required,
                };
                let root =
                    named_field(arg).map_or(Root::Target, |name| Root::Field(name.to_owned()));
                self.properties.push((
                    property,
                    Read {
                        root,
                        path: segments(arg),
                        row_count: false,
                    },
                ));
            }
            ("count" | "length", [arg]) if named_field(arg).is_some() => {
                let first = self.values.len();
                self.visit(arg, locals, predicate, &[]);
                if let Some(read) = self.values.get_mut(first) {
                    read.row_count = true;
                }
            }
            (
                "countWhere" | "every" | "some" | "sumWhere" | "avgWhere" | "minWhere" | "maxWhere"
                | "moneySumWhere",
                [source, condition],
            ) => {
                let mut inner = Self::default();
                inner.visit(condition, locals, true, &[]);
                if matches!(name, "countWhere" | "every" | "some")
                    && let Some(field) = named_field(source)
                    && !locals.contains(&field)
                {
                    let source_path = segments(source);
                    // Predicates over row objects read their selected members.
                    // Iterating over the collection itself only needs its length.
                    self.values.push(Read {
                        root: Root::Field(field.to_owned()),
                        path: source_path.clone(),
                        row_count: true,
                    });
                    for access in inner.predicate_values {
                        let mut path = source_path.clone();
                        if !path.contains(&PathSegment::Wildcard) {
                            path.push(PathSegment::Wildcard);
                        }
                        path.extend(access);
                        self.values.push(Read {
                            root: Root::Field(field.to_owned()),
                            path,
                            row_count: false,
                        });
                    }
                } else {
                    self.visit(source, locals, predicate, &[]);
                }
                self.values.extend(inner.values);
                self.variables.extend(inner.variables);
                self.properties.extend(inner.properties);
            }
            _ => {
                for arg in args {
                    self.visit(arg, locals, predicate, &[]);
                }
            }
        }
    }
}

/// Member reads of the array element bound to bare dollar in a predicate.
pub fn predicate_value_paths(expr: &Expr) -> Vec<Vec<PathSegment>> {
    let mut reads = Reads::default();
    reads.visit(expr, &mut Vec::new(), true, &[]);
    reads.predicate_values
}

fn named_field(expr: &Expr) -> Option<&str> {
    match expr {
        Expr::FieldRef { name, .. } => name.as_deref(),
        Expr::VarRef { name, .. } => Some(name),
        _ => None,
    }
}

fn segments(expr: &Expr) -> Vec<PathSegment> {
    match expr {
        Expr::FieldRef { path, .. } | Expr::VarRef { path, .. } => path.clone(),
        Expr::ContextRef { tail, .. } => tail.iter().cloned().map(PathSegment::Dot).collect(),
        _ => Vec::new(),
    }
}

fn extend_path(mut path: Vec<PathSegment>, suffix: &[PathSegment]) -> Vec<PathSegment> {
    let atom_len = path.len();
    for segment in suffix {
        if let Some(axis) = path[..atom_len]
            .iter()
            .position(|part| *part == PathSegment::Wildcard)
        {
            if let PathSegment::Index(_) = segment {
                // A postfix index on a projection selects one result on its first wildcard axis.
                path[axis] = segment.clone();
            } else {
                break;
            }
        } else {
            path.push(segment.clone());
        }
    }
    path
}
