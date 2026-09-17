//! Evaluation options for [`crate::pipeline::evaluate`].

use std::collections::HashMap;
use std::fmt;

use fel_core::ExtensionFunctions;
use serde_json::Value;

use crate::types::{EvalContext, EvalTrigger, ExtensionConstraint, ItemTextRequest};

/// Options for a single definition evaluation ([`crate::pipeline::evaluate`]).
#[derive(Clone)]
pub struct EvalOptions<'a> {
    /// When to evaluate shape rules.
    pub trigger: EvalTrigger,
    /// Extension constraints resolved from registry documents.
    pub extension_constraints: Vec<ExtensionConstraint>,
    /// Named instance payloads for pre-populate and `@instance()`.
    pub instances: HashMap<String, Value>,
    /// When true (default), apply creation-time `seedFrom`. False when live FormEngine sends `repeatCounts`.
    pub apply_creation_seeds: bool,
    /// Runtime context (now, prior validations, repeat counts).
    pub context: EvalContext,
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
            apply_creation_seeds: true,
            context: EvalContext::default(),
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
            .field("apply_creation_seeds", &self.apply_creation_seeds)
            .field("context", &self.context)
            .field(
                "extensions",
                &self.extensions.map(|_| "<host extension functions>"),
            )
            .field("item_text", &self.item_text)
            .finish()
    }
}

impl<'a> EvalOptions<'a> {
    /// Create options with defaults (continuous trigger, empty instances/constraints).
    pub fn new() -> Self {
        Self::default()
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

    /// Apply `seedFrom` on this evaluation. False for live-engine Rebuilds.
    pub fn apply_creation_seeds(mut self, apply: bool) -> Self {
        self.apply_creation_seeds = apply;
        self
    }

    /// Set runtime evaluation context.
    pub fn context(mut self, context: EvalContext) -> Self {
        self.context = context;
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
