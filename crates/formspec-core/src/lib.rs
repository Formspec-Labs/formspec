//! Formspec core processing — FEL, paths, schemas, assembly, mappings, extensions.
//!
//! Depends on the `fel_core` crate and holds the non-reactive processing layer used by WASM,
//! Python, and batch evaluators. Human overview: crate `README.md`. Markdown API export:
//! `docs/rustdoc-md/API.md` (regenerate with `npm run docs:formspec-core`).
#![warn(missing_docs)]
// Enforced via `cargo clippy -p formspec-core`; rustc ignores `clippy::` lints.
#![warn(clippy::missing_docs_in_private_items)]

pub mod assembler;
pub mod assembly_fel_rewrite;
pub mod changelog;
pub mod component_tree;
pub mod definition_items;
pub mod extension_analysis;
pub mod fel_analysis;
pub mod fel_condition_group_lift;
pub mod fel_rewrite_exact;
pub mod json_artifacts;
pub mod json_util;
pub mod option_sets;
pub mod path_utils;
pub mod registry_client;
pub mod response_migration;
pub mod runtime_mapping;
pub mod schema_validator;
pub mod value_coerce;
pub mod wire_keys;

// Re-export key types
pub use assembler::{
    AssemblyError, AssemblyProvenance, AssemblyResult, MapResolver, RefResolver,
    assemble_definition, assembly_result_to_json_value,
};
pub use assembly_fel_rewrite::{
    AssemblyFelRewriteMap, assembly_fel_rewrite_map_from_value, rewrite_fel_for_assembly,
};
pub use component_tree::visit_component_subtree;
pub use definition_items::{
    DefinitionItemKeyPolicy, DefinitionItemVisitCtx, coerce_definition_item_key_segment,
    definition_item_dotted_path, definition_item_key_segment,
    extension_item_diagnostic_path_from_dotted, visit_definition_items_from_document,
    visit_definition_items_json, visit_definition_items_json_shallow,
    visit_definition_items_json_with_policy,
};
pub use extension_analysis::{
    ExtensionErrorCode, ExtensionItem, ExtensionSeverity, ExtensionUsageIssue, JsonDefinitionItem,
    MapRegistry, RegistryEntryInfo, RegistryEntryStatus, RegistryLookup,
    json_definition_items_tree_from_value, map_registry_from_extension_entry_map,
    validate_extension_usage,
};
pub use fel_analysis::{
    FelAnalysis, FelRewriteTargets, NavigationTarget, RewriteOptions, analyze_fel,
    analyze_fel_with_field_types, collect_fel_rewrite_targets, fel_analysis_to_json_value,
    fel_rewrite_targets_to_json_value, get_fel_dependencies, rewrite_fel_references,
    rewrite_options_from_camel_case_json,
};
pub use fel_condition_group_lift::try_lift_condition_group;
pub use fel_rewrite_exact::{rewrite_fel_source_references, rewrite_message_template};
pub use json_artifacts::{changelog_to_json_value, extension_usage_issues_to_json_value};
pub use json_util::json_object_to_string_map;
pub use option_sets::resolve_option_sets_on_definition;
pub use path_utils::{
    ItemLocation, TreeItem, definition_item_location_to_json_value, item_at_path,
    item_location_at_path, json_definition_item_at_path, json_definition_item_location_at_path,
    leaf_key, normalize_indexed_path, normalize_path_segment, parent_path, split_normalized_path,
};
pub use response_migration::apply_migrations_to_response_data;
pub use runtime_mapping::{
    ArrayDescriptor, ArrayMode, CoerceType, MappingDiagnostic, MappingDirection, MappingDocument,
    MappingErrorCode, MappingResult, MappingRule, ReverseOverride, TransformType, UnmappedStrategy,
    execute_mapping, execute_mapping_doc, mapping_direction_wire, mapping_result_to_json_value,
    parse_coerce_type, parse_mapping_direction_field, parse_mapping_direction_wire,
    parse_mapping_document_from_value, parse_mapping_rules_from_value,
};
pub use schema_validator::{
    ComponentValidationTarget, DocumentType, JsonSchemaValidator, SchemaValidationError,
    SchemaValidationPlan, SchemaValidationResult, detect_document_type, json_pointer_to_jsonpath,
    schema_validation_plan, validate_document,
};
pub use value_coerce::coerce_field_value;
pub use wire_keys::JsonWireStyle;
