//! Evaluation options for [`crate::pipeline::evaluate`].

use std::collections::HashMap;

use serde_json::Value;

use crate::types::{EvalContext, EvalTrigger, ExtensionConstraint};

/// Options for a single definition evaluation ([`crate::pipeline::evaluate`]).
#[derive(Debug, Clone)]
pub struct EvalOptions {
    /// When to evaluate shape rules.
    pub trigger: EvalTrigger,
    /// Extension constraints resolved from registry documents.
    pub extension_constraints: Vec<ExtensionConstraint>,
    /// Named instance payloads for pre-populate and `@instance()`.
    pub instances: HashMap<String, Value>,
    /// Runtime context (now, prior validations, repeat counts).
    pub context: EvalContext,
}

impl Default for EvalOptions {
    fn default() -> Self {
        Self {
            trigger: EvalTrigger::Continuous,
            extension_constraints: Vec::new(),
            instances: HashMap::new(),
            context: EvalContext::default(),
        }
    }
}

impl EvalOptions {
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
}
