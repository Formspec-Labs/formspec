//! Reads extracted from parsed FEL before resolving each evaluation site.

use fel_core::{Expr, ast::PathSegment};

/// The point from which a FEL value read is resolved.
#[derive(Debug, Clone)]
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
#[derive(Debug, Clone)]
pub struct Read {
    /// The lexical reference root.
    pub root: Root,
    /// FEL selectors and members after the root.
    pub path: Vec<PathSegment>,
    /// The operation can read just row count when this path names a repeat array.
    pub row_count: bool,
}

/// Enclosing lexical binding around a dynamic `instance()` or `subject()` argument.
#[derive(Debug, Clone)]
pub enum LexicalScope {
    /// `let name = value in ...`
    Let {
        /// Bound variable name.
        name: String,
        /// Defining FEL expression evaluated in the outer scope.
        value: Expr,
    },
    /// Collection predicate binding bare `$` to each element of `source`.
    Predicate {
        /// Collection expression evaluated in the outer scope.
        source: Expr,
        /// Whether any enclosed expression before an inner predicate shadows `$` reads this element.
        reads_element: bool,
    },
}

#[derive(Clone)]
enum RawScope {
    Let { name: String, value: Expr },
    Predicate { source: Expr },
}

/// Secondary-instance or subject reference extracted from FEL.
#[derive(Debug, Clone)]
pub enum ExternalRead {
    /// `@instance("name")` with trailing path segments.
    StaticInstance {
        /// Literal instance name (`None` when `@instance` was written without an argument).
        name: Option<String>,
        /// Postfix path segments after `@instance("name")`.
        path: Vec<PathSegment>,
    },
    /// `instance(name, path?)` with trailing path segments.
    Instance {
        /// First argument supplying the instance name.
        name: Option<Expr>,
        /// Optional second argument supplying a dot-separated member path.
        member: Option<Expr>,
        /// Postfix path segments after `instance(...)`.
        suffix: Vec<PathSegment>,
        /// Enclosing `let` and predicate scopes, outermost first.
        scopes: Vec<LexicalScope>,
    },
    /// `subject(key)` with trailing path segments.
    Subject {
        /// First argument supplying the subject key name.
        key: Option<Expr>,
        /// Postfix path segments after `subject(...)`.
        suffix: Vec<PathSegment>,
        /// Enclosing `let` and predicate scopes, outermost first.
        scopes: Vec<LexicalScope>,
    },
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
    /// The FEL function that queries this property.
    pub fn function_name(self) -> &'static str {
        match self {
            Self::Required => "required",
            Self::Relevant => "relevant",
            Self::Readonly => "readonly",
            Self::Valid => "valid",
        }
    }

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
#[derive(Debug, Default, Clone)]
pub struct Reads {
    /// Instance values read by the expression (narrowed for dependency ordering).
    pub values: Vec<Read>,
    /// Primary-data reads for Core §2.1.6 warning explanation bases.
    pub basis_values: Vec<Read>,
    /// Definition variables read by name, before lexical scope resolution.
    pub variables: Vec<String>,
    /// Definition variables with any resolved member/postfix path for Core §2.1.6.
    pub variable_paths: Vec<(String, Vec<PathSegment>)>,
    /// Secondary-instance and `subject()` reads for Core §2.1.6.
    pub external_reads: Vec<ExternalRead>,
    /// Model-item properties queried and their targets.
    pub properties: Vec<(Property, Read)>,
    /// Queries whose argument is not a `$path` field reference, a definition error (Core §3.5.9).
    pub non_field_property_arguments: Vec<Property>,
    predicate_values: Vec<Vec<PathSegment>>,
}

impl Reads {
    /// Extract reads, accounting for local variables and predicate scope.
    pub fn new(expr: &Expr) -> Self {
        let mut reads = Self::default();
        reads.visit(expr, &mut Vec::new(), &mut Vec::new(), false, &[]);
        reads
    }

    fn visit<'a>(
        &mut self,
        expr: &'a Expr,
        locals: &mut Vec<&'a str>,
        scopes: &mut Vec<RawScope>,
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
            Expr::ContextRef { name, arg, .. } => {
                if name == "instance" {
                    self.external_reads.push(ExternalRead::StaticInstance {
                        name: arg.clone(),
                        path: extend_path(segments(expr), suffix),
                    });
                } else if !matches!(name.as_str(), "index" | "count") {
                    self.variables.push(name.clone());
                    self.variable_paths
                        .push((name.clone(), extend_path(segments(expr), suffix)));
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
            let read = Read {
                root,
                path: extend_path(segments(expr), suffix),
                row_count: false,
            };
            self.basis_values.push(read.clone());
            self.values.push(read);
            return;
        }
        match expr {
            Expr::PostfixAccess { expr, path } => {
                let path: Vec<_> = path.iter().chain(suffix).cloned().collect();
                self.visit(expr, locals, scopes, predicate, &path);
            }
            Expr::RowLookup {
                source,
                key_path,
                key,
            } => {
                let field_source = is_field_reference(source, locals);
                let mut source_reads = Self::default();
                source_reads.visit(source, locals, scopes, predicate, &[]);
                if !field_source {
                    self.values.extend(source_reads.values);
                }
                self.basis_values.extend(source_reads.basis_values);
                self.variables.extend(source_reads.variables);
                self.variable_paths.extend(source_reads.variable_paths);
                self.external_reads.extend(source_reads.external_reads);
                self.properties.extend(source_reads.properties);
                self.non_field_property_arguments
                    .extend(source_reads.non_field_property_arguments);
                self.predicate_values.extend(source_reads.predicate_values);

                self.visit(key, locals, scopes, predicate, &[]);
                if field_source {
                    let wildcard = std::iter::once(PathSegment::Wildcard);
                    let key: Vec<_> = wildcard
                        .clone()
                        .chain(key_path.iter().cloned().map(PathSegment::Dot))
                        .collect();
                    self.visit(source, locals, scopes, predicate, &key);
                    let selected: Vec<_> = wildcard.chain(suffix.iter().cloned()).collect();
                    self.visit(source, locals, scopes, predicate, &selected);
                }
            }
            Expr::LetBinding { name, value, body } => {
                self.visit(value, locals, scopes, predicate, &[]);
                locals.push(name);
                scopes.push(RawScope::Let {
                    name: name.clone(),
                    value: (**value).clone(),
                });
                self.visit(body, locals, scopes, predicate, suffix);
                scopes.pop();
                locals.pop();
            }
            Expr::FunctionCall { name, args } => {
                self.call(name, args, locals, scopes, predicate, suffix);
            }
            _ => {
                let mut visit = |child| self.visit(child, locals, scopes, predicate, &[]);
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
        scopes: &mut Vec<RawScope>,
        predicate: bool,
        suffix: &[PathSegment],
    ) {
        match (name, args) {
            ("valid" | "relevant" | "readonly" | "required", [arg]) => {
                if predicate && named_field(arg).is_none() {
                    self.visit(arg, locals, scopes, true, &[]);
                }
                let property = match name {
                    "valid" => Property::Valid,
                    "relevant" => Property::Relevant,
                    "readonly" => Property::Readonly,
                    _ => Property::Required,
                };
                let root =
                    named_field(arg).map_or(Root::Target, |name| Root::Field(name.to_owned()));
                if !matches!(arg, Expr::FieldRef { .. }) {
                    self.non_field_property_arguments.push(property);
                }
                let read = Read {
                    root,
                    path: segments(arg),
                    row_count: false,
                };
                self.basis_values.push(read.clone());
                self.properties.push((property, read));
            }
            ("count" | "length", [arg]) if named_field(arg).is_some() => {
                let first = self.values.len();
                self.visit(arg, locals, scopes, predicate, &[]);
                if let Some(read) = self.values.get_mut(first) {
                    read.row_count = true;
                }
            }
            (
                "countWhere" | "every" | "some" | "sumWhere" | "avgWhere" | "minWhere" | "maxWhere"
                | "moneySumWhere",
                [source, condition],
            ) => {
                scopes.push(RawScope::Predicate {
                    source: source.clone(),
                });
                let mut inner = Self::default();
                inner.visit(condition, locals, scopes, true, &[]);
                scopes.pop();
                if matches!(name, "countWhere" | "every" | "some")
                    && let Some(field) = named_field(source)
                    && !locals.contains(&field)
                {
                    let mut source_basis = Self::default();
                    source_basis.visit(source, locals, scopes, predicate, &[]);
                    self.basis_values.extend(source_basis.basis_values);
                    self.variables.extend(source_basis.variables);
                    self.variable_paths.extend(source_basis.variable_paths);
                    self.external_reads.extend(source_basis.external_reads);
                    self.properties.extend(source_basis.properties);
                    self.non_field_property_arguments
                        .extend(source_basis.non_field_property_arguments);
                    self.predicate_values.extend(source_basis.predicate_values);

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
                    self.visit(source, locals, scopes, predicate, &[]);
                }
                self.values.extend(inner.values);
                self.basis_values.extend(inner.basis_values);
                self.variables.extend(inner.variables);
                self.variable_paths.extend(inner.variable_paths);
                self.external_reads.extend(inner.external_reads);
                self.properties.extend(inner.properties);
                self.non_field_property_arguments
                    .extend(inner.non_field_property_arguments);
            }
            ("instance", _) => {
                for arg in args {
                    self.visit(arg, locals, scopes, predicate, &[]);
                }
                let leaf_exprs: Vec<&Expr> = args.iter().take(2).collect();
                self.external_reads.push(ExternalRead::Instance {
                    name: args.first().cloned(),
                    member: args.get(1).cloned(),
                    suffix: suffix.to_vec(),
                    scopes: resolve_scopes(scopes, &leaf_exprs),
                });
            }
            ("subject", _) => {
                for arg in args {
                    self.visit(arg, locals, scopes, predicate, &[]);
                }
                let leaf_exprs: Vec<&Expr> = args.iter().take(1).collect();
                self.external_reads.push(ExternalRead::Subject {
                    key: args.first().cloned(),
                    suffix: suffix.to_vec(),
                    scopes: resolve_scopes(scopes, &leaf_exprs),
                });
            }
            _ => {
                for arg in args {
                    self.visit(arg, locals, scopes, predicate, &[]);
                }
            }
        }
    }
}

/// Member reads of the array element bound to bare dollar in a predicate.
pub fn predicate_value_paths(expr: &Expr) -> Vec<Vec<PathSegment>> {
    let mut reads = Reads::default();
    reads.visit(expr, &mut Vec::new(), &mut Vec::new(), true, &[]);
    reads.predicate_values
}

fn resolve_scopes(scopes: &[RawScope], leaf_exprs: &[&Expr]) -> Vec<LexicalScope> {
    scopes
        .iter()
        .enumerate()
        .map(|(idx, scope)| match scope {
            RawScope::Let { name, value } => LexicalScope::Let {
                name: name.clone(),
                value: value.clone(),
            },
            RawScope::Predicate { source } => LexicalScope::Predicate {
                source: source.clone(),
                reads_element: scope_reads_predicate_element(&scopes[idx + 1..], leaf_exprs),
            },
        })
        .collect()
}

fn scope_reads_predicate_element(rest: &[RawScope], leaf_exprs: &[&Expr]) -> bool {
    for scope in rest {
        match scope {
            RawScope::Let { value, .. } => {
                if !predicate_value_paths(value).is_empty() {
                    return true;
                }
            }
            RawScope::Predicate { source } => {
                // Only `source` sees the outer `$`; the inner predicate shadows `$` in its body.
                return !predicate_value_paths(source).is_empty();
            }
        }
    }
    leaf_exprs
        .iter()
        .any(|expr| !predicate_value_paths(expr).is_empty())
}

fn is_field_reference(expr: &Expr, locals: &[&str]) -> bool {
    match expr {
        Expr::FieldRef { .. } => true,
        Expr::VarRef { name, .. } => !locals.contains(&name.as_str()),
        Expr::ContextRef { name, .. } => name == "current",
        Expr::FunctionCall { name, args } if args.is_empty() => {
            matches!(name.as_str(), "prev" | "next" | "parent")
        }
        Expr::PostfixAccess { expr, .. } | Expr::RowLookup { source: expr, .. } => {
            is_field_reference(expr, locals)
        }
        _ => false,
    }
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
