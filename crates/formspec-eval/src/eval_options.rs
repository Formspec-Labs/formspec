//! Evaluation options for [`crate::pipeline::evaluate`].

use std::collections::HashMap;
use std::fmt;

use fel_core::ExtensionFunctions;
use fel_core::exact_json::Value;

use crate::registry_constraints::{
    RegistryConstraintsError, validated_extension_constraints_from_registry_documents,
};
use crate::resolved_options::ResolvedOptionLists;
use crate::types::{EvalContext, EvalSubject, EvalTrigger, ExtensionConstraint, ItemTextRequest};

/// Options for a single definition evaluation ([`crate::pipeline::evaluate`]).
#[derive(Clone)]
pub struct EvalOptions<'a> {
    /// When to evaluate shape rules.
    pub trigger: EvalTrigger,
    /// Extension constraints resolved from registry documents.
    pub extension_constraints: Vec<ExtensionConstraint>,
    /// Named instance payloads for `@instance()`.
    pub instances: HashMap<String, Value>,
    /// Runtime context (clock and prior processing state).
    pub context: EvalContext,
    /// Host-supplied resolved option lists for remote `optionSets` and URI-string `Item.options`.
    pub resolved_option_lists: ResolvedOptionLists,
    /// Host extension functions (Core §3.12) for every Definition expression.
    ///
    /// Without them, a call to an extension function is a definition error
    /// (Core §3.10.1).
    pub extensions: Option<&'a dyn ExtensionFunctions>,
    /// Resolve Item text too ([`crate::EvaluationResult::item_text`]); `None` skips the text pass.
    pub item_text: Option<ItemTextRequest>,
}

impl Default for EvalOptions<'_> {
    fn default() -> Self {
        Self {
            trigger: EvalTrigger::Continuous,
            extension_constraints: Vec::new(),
            instances: HashMap::new(),
            context: EvalContext::default(),
            resolved_option_lists: ResolvedOptionLists::default(),
            extensions: None,
            item_text: None,
        }
    }
}

impl fmt::Debug for EvalOptions<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("EvalOptions")
            .field("trigger", &self.trigger)
            .field("extension_constraints", &self.extension_constraints)
            .field("instances", &self.instances)
            .field("context", &self.context)
            .field("resolved_option_lists", &self.resolved_option_lists)
            .field(
                "extensions",
                &self.extensions.map(|_| "<host extension functions>"),
            )
            .field("item_text", &self.item_text)
            .finish()
    }
}

/// Build canonical recheck [`EvalOptions`] from trigger, clock, instances, pinned registry
/// documents, and resolved remote option lists (`fs-20e3`, `fs-oxsy`).
///
/// Validates the supplied registry documents once via
/// [`validated_extension_constraints_from_registry_documents`], rejecting duplicate extension
/// names and unsupported or malformed constraints before evaluation starts. Callers that also
/// carry a stored Response `subject` or `explanations` can chain [`EvalOptions::with_subject`]
/// and [`EvalOptions::with_explanations`] on the returned options.
///
/// # Errors
///
/// Returns [`RegistryConstraintsError`] when any registry document is malformed, declares a
/// duplicate extension name, or contains an unsupported or invalid constraint.
pub fn recheck_eval_options(
    trigger: EvalTrigger,
    clock_iso: Option<String>,
    instances: HashMap<String, Value>,
    registry_documents: &[Value],
    resolved_option_lists: ResolvedOptionLists,
) -> Result<EvalOptions<'static>, RegistryConstraintsError> {
    EvalOptions::for_recheck(
        trigger,
        clock_iso,
        instances,
        registry_documents,
        resolved_option_lists,
    )
}

impl<'a> EvalOptions<'a> {
    /// Create options with defaults (continuous trigger, empty instances/constraints).
    pub fn new() -> Self {
        Self::default()
    }

    /// Build canonical recheck options from trigger, clock, instances, pinned registry documents,
    /// and host-supplied resolved option lists (`fs-20e3`, `fs-oxsy`).
    ///
    /// # Errors
    ///
    /// Returns [`RegistryConstraintsError`] when any registry document fails qualification.
    pub fn for_recheck(
        trigger: EvalTrigger,
        clock_iso: Option<String>,
        instances: HashMap<String, Value>,
        registry_documents: &[Value],
        resolved_option_lists: ResolvedOptionLists,
    ) -> Result<Self, RegistryConstraintsError> {
        let extension_constraints =
            validated_extension_constraints_from_registry_documents(registry_documents)?;
        Ok(Self {
            trigger,
            extension_constraints,
            instances,
            context: EvalContext {
                now_iso: clock_iso,
                ..EvalContext::default()
            },
            resolved_option_lists,
            extensions: None,
            item_text: None,
        })
    }

    /// Set shape evaluation timing.
    pub fn trigger(mut self, trigger: EvalTrigger) -> Self {
        self.trigger = trigger;
        self
    }

    /// Replace extension constraints from registries.
    pub fn extension_constraints(mut self, constraints: Vec<ExtensionConstraint>) -> Self {
        self.extension_constraints = constraints;
        self
    }

    /// Set named instance payloads.
    pub fn instances(mut self, instances: HashMap<String, Value>) -> Self {
        self.instances = instances;
        self
    }

    /// Set runtime evaluation context.
    pub fn context(mut self, context: EvalContext) -> Self {
        self.context = context;
        self
    }

    /// Set host-supplied resolved option lists for remote `optionSets` and URI-string `Item.options`.
    pub fn resolved_option_lists(mut self, lists: ResolvedOptionLists) -> Self {
        self.resolved_option_lists = lists;
        self
    }

    /// Set the Response subject on `context` while keeping the clock and other fields intact.
    pub fn with_subject(mut self, subject: Option<EvalSubject>) -> Self {
        self.context.subject = subject;
        self
    }

    /// Set stored warning explanations on `context` while keeping the clock and other fields intact.
    pub fn with_explanations(mut self, explanations: Vec<Value>) -> Self {
        self.context.explanations = explanations;
        self
    }

    /// Resolve Item text for every Item instance alongside evaluation (Core §4.2.1).
    pub fn item_text(mut self, request: ItemTextRequest) -> Self {
        self.item_text = Some(request);
        self
    }

    /// Resolve extension function calls through the host's `extensions` (Core §3.12).
    pub fn extensions(mut self, extensions: &'a dyn ExtensionFunctions) -> Self {
        self.extensions = Some(extensions);
        self
    }
}
