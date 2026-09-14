//! Evaluation options for [`crate::pipeline::evaluate`].

use std::collections::HashMap;
use std::fmt;

use fel_core::ExtensionFunctions;
use serde_json::Value;

use crate::types::{EvalContext, EvalTrigger, ExtensionConstraint};

/// Options for a single definition evaluation ([`crate::pipeline::evaluate`]).
#[derive(Clone)]
pub struct EvalOptions<'a> {
    /// When to evaluate shape rules.
    pub trigger: EvalTrigger,
    /// Extension constraints resolved from registry documents.
    pub extension_constraints: Vec<ExtensionConstraint>,
    /// Named instance payloads for pre-populate and `@instance()`.
    pub instances: HashMap<String, Value>,
    /// Runtime context (now, prior validations, repeat counts).
    pub context: EvalContext,
    /// Host extension functions (Core §3.12) for every Definition expression.
    ///
    /// Without them, a call to an extension function is a definition error
    /// (Core §3.10.1).
    pub extensions: Option<&'a dyn ExtensionFunctions>,
}

impl Default for EvalOptions<'_> {
    fn default() -> Self {
        Self {
            trigger: EvalTrigger::Continuous,
            extension_constraints: Vec::new(),
            instances: HashMap::new(),
            context: EvalContext::default(),
            extensions: None,
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
            .field(
                "extensions",
                &self.extensions.map(|_| "<host extension functions>"),
            )
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

    /// Set runtime evaluation context.
    pub fn context(mut self, context: EvalContext) -> Self {
        self.context = context;
        self
    }

    /// Resolve extension function calls through the host's `extensions` (Core §3.12).
    pub fn extensions(mut self, extensions: &'a dyn ExtensionFunctions) -> Self {
        self.extensions = Some(extensions);
        self
    }
}
