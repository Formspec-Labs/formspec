# **Universal Declarative Form Architecture (UDFA): A Format-Agnostic JSON Standard**

## **1\. Architectural Lineage and the Form Data Gap**

The evolution of digital data collection has historically been fragmented by an artificial dichotomy between presentation-centric frameworks and schema-centric validation protocols. In 2003, the W3C XForms specification introduced a paradigm-shifting conceptual model: the strict separation of form logic—encompassing instance data, reactive dependency graphs, and Model Item Properties (MIPs)—from visual presentation mechanics.1 XForms successfully solved the computational complexity of declarative user interface behaviors, proving that separating intent from rendering allows for unparalleled flexibility. However, its deep and inextricable coupling with XML and XPath rendered it increasingly incompatible with the modern, JSON-native web ecosystem.3 Consequently, contemporary JSON form libraries have repeatedly reinvented isolated fragments of the XForms model without achieving its systemic coherence, standardized vocabulary, or platform-agnostic completeness.5

The Universal Declarative Form Architecture (UDFA) bridges this persistent gap by establishing a format-agnostic, JSON-native standard. UDFA functions conceptually as "JSON-LD for XForms," preserving the declarative power of the original W3C specification while integrating two decades of advancements in data validation, schema evolution, and linked data semantics.6 The architecture is synthesized from three primary ancestral lineages, meticulously isolating what is essential to the declarative model from what was merely incidental to older serialization formats.

First, UDFA inherits the W3C XForms field model, specifically the reactive dependency graph, multiple data instances, and Model Item Properties (calculate, constraint, relevant, required, readonly), stripping away the XML dependencies in favor of native JSON structures.2 Second, it adopts the W3C SHACL validation model, explicitly decoupling constraint definition from data instances and formalizing a multi-tiered severity framework (Error, Warning, Info) alongside structured, graph-based validation reporting.9 Third, it integrates the robust identity, modularity, and versioning semantics of HL7 FHIR R5 and the Structured Data Capture (SDC) Implementation Guide, enabling seamless schema evolution, response pinning, and complex cross-form conditionals without risking data corruption in historical archives.10

UDFA is designed strictly as a conceptual model and data representation standard. It defines the ontological structure of form data, the syntax of reactive expressions, and the execution semantics of validation rules. It explicitly leaves presentation layer implementation, layout rendering, data entry user experience, and workflow orchestration to external applications, focusing entirely on the rigorous definition of state, behavior, and data integrity.

## **2\. The Conceptual Model: Nouns, Verbs, and Semantics**

The core conceptual model of UDFA relies on a strict Model-View-Controller (MVC) separation transposed for modern JSON environments.1 It isolates the definition of the form from the execution state, and further isolates the structural schema from the behavioral constraints. This guarantees that forms exist as pure data (AD-01), remaining entirely program-agnostic (AD-03) and highly compatible with future no-code visual authoring environments (AD-02).

### **2.1 The Nouns: Core Abstractions**

The architecture defines four primary ontological entities that encapsulate the entirety of a form's lifecycle and state.

| Entity | Structural Definition | Semantic Purpose |
| :---- | :---- | :---- |
| FormDefinition | The immutable JSON blueprint identified by a Canonical URL. | Contains structural nodes, bindings, validation shapes, and lifecycle metadata. Acts as the absolute source of truth for a specific version of a data collection instrument. |
| DataInstance | The dynamic JSON payload representing execution state. | Holds the user-submitted data. UDFA supports multiple instances, allowing a primary instance for collection and secondary instances for external references and pre-population data. |
| BindGraph | The reactive dependency engine mapping behaviors to the DataInstance. | Maps Model Item Properties (MIPs) to specific nodes, orchestrating calculations, visibility, and dynamic requirements based on real-time state mutations. |
| ValidationShape | Decoupled constraint definitions governing data integrity. | Defines logical assertions evaluated against the DataInstance to generate structured validation results, operating independently of the form's structural layout. |

### **2.2 The Verbs: Execution Semantics**

These entities interact through specific verb semantics executed by the UDFA compliant controller. The evaluate operation parses the BindGraph, executing mathematical and logical expressions to update the DataInstance dynamically. The recompute operation updates the topological state of the form when dependencies change, utilizing a Directed Acyclic Graph (DAG) to ensure only affected nodes are recalculated, mirroring optimal expression engine behaviors.13 The validate operation executes the ValidationShape constraints against the DataInstance, generating structured validation reports. Finally, the assemble operation constructs complex FormDefinitions from modular, sub-form components, replicating the FHIR SDC $assemble operation to merge modular sub-questionnaires into a flattened, executable artifact.15

### **2.3 Multiple Instances and External Data**

UDFA natively supports multiple data instances within a single execution context. The primary instance represents the form being actively completed. Secondary instances serve as read-only lookup tables, prepopulated historical data, or cross-form reference points (FL-04). Secondary instances are initialized through pre-population semantics analogous to the FHIR SDC initialExpression and itemPopulationContext extensions.16 This capability allows complex government or financial systems to inject prior-year submissions or external API payloads directly into the expression context. A field can calculate its value or establish a warning threshold by referencing instance('prior\_year').financials.total\_revenue. Furthermore, pre-populated fields explicitly declare whether they are editable defaults or cryptographically locked values representing external system truths (FT-05).

## **3\. Field Definitions and Form Logic**

UDFA field definitions describe the structural properties and semantic intent of the data being collected. Standard JSON schemas rely on structural typing, which is insufficient for rich data collection. UDFA implements semantic typing, allowing systems to interpret how data should be handled logically, even if the underlying JSON storage type is a simple string or number.

### **3.1 Field Types and Structural Semantics**

The standard defines a base set of program-agnostic field types necessary for complex government and financial data collection (FT-01).

| UDFA Type | JSON Storage Type | Semantic Constraints |
| :---- | :---- | :---- |
| string | String | UTF-8 text, supports regex pattern matching and length boundaries. |
| number | Number | Supports standard floating-point or integer validation. |
| financial | Object | A tuple containing amount (decimal precision) and currency (ISO 4217 code) to guarantee precision accounting operations without floating-point degradation (FT-02). |
| date / datetime | String | ISO 8601 formatted strings. Enables temporal JEXL-F arithmetic (e.g., calculating age or durations). |
| boolean | Boolean | Strict true/false representations. |
| choice / choices | String / Array | Single or multi-select enumerations bound to internal or external code systems. |
| attachment | Object | Models file metadata (filename, MIME type, byte size, external storage URI reference). The standard models the field, keeping core form logic cleanly decoupled from binary blob storage mechanics (FT-03). |

### **3.2 Metadata and Contextual Labels**

Enterprise forms require dense metadata to drive accessible and context-aware user interfaces. UDFA embeds Field Metadata (FM-01) directly into the definition node. This includes the canonical human label, extended description or help text, and alternative display labels per context (e.g., "Short Label" for mobile views versus "Long Label" for print rendering). When a field is excluded by conditional logic, the standard explicitly allows the definition of a default value (FM-02) to be injected into the data payload to satisfy downstream database constraints, ensuring that null or undefined states do not break legacy relational database ingest pipelines.

### **3.3 Dynamic Form Logic and Non-Relevant Data Exclusion**

UDFA implements a dynamic field model driven by Model Item Properties (MIPs). MIPs attach behavioral expressions to specific data nodes via the declarative binding layer. This ensures that the logic governing a field's state is independent of how the field is rendered.

| Model Item Property | Execution Semantics | Exclusion Behavior |
| :---- | :---- | :---- |
| calculate | Automatically computes the node's value based on an expression. Overwrites manual input if strictly bound (FT-04). | Evaluates regardless of relevance unless explicitly short-circuited by engine optimization. |
| constraint | Evaluates a boolean expression; if false, triggers a validation failure. | Skipped if the node is marked as non-relevant. |
| relevant | Evaluates a boolean determining visibility and inclusion (FL-01). | If false, the node is strictly pruned from the submission payload (FL-02). |
| required | Evaluates a boolean; if true, the node must contain a non-empty value. | Skipped if the node is marked as non-relevant. |
| readonly | Evaluates a boolean; if true, the UI must prevent mutation. | Retains data in the submission payload, unlike non-relevant nodes. |

The most critical semantic rule inherited from XForms is non-relevant data exclusion.18 If a node's relevant expression evaluates to false, the data is entirely excluded from the submitted DataInstance. This prevents orphaned data from polluting databases when conditional logic branches change during user data entry, resolving a ubiquitous issue in naive JSON form implementations where visually hidden fields erroneously submit stale data.

## **4\. The Expression Language: JEXL-F**

To ensure UDFA is implementable across diverse technology stacks, it requires a format-agnostic, safely parsable expression language. UDFA standardizes on the JSON Expression Language for Forms (JEXL-F). This engine is heavily influenced by ODK's clear ${field} syntax, SurveyJS's PEG.js-based dependency engine, and the Common Expression Language (CEL) optimized for linear-time evaluation.13 JEXL-F avoids the Turing-completeness of JavaScript, ensuring expressions evaluate predictably without side effects or infinite loops.20

### **4.1 Syntax and Coercion Semantics**

Expressions in JEXL-F use dot-notation for path traversal and curly braces for node referencing. The language supports standard arithmetic operators (+, \-, \*, /), logical operators (and, or, not), and cross-type comparison operators (==, \!=, \>, \<). JEXL-F implements explicit, predictable type coercion rules. When evaluating ${string} \== ${number}, the engine automatically attempts numeric coercion to prevent trivial failure states common in web-based inputs, while concatenation explicitly requires a concat() function to avoid the overloaded \+ operator ambiguities present in standard JavaScript.

### **4.2 The Reactive Dependency Graph**

The UDFA evaluation engine parses JEXL-F expressions to build a Directed Acyclic Graph (DAG) of all data dependencies at initialization. When a node's value mutates, the engine utilizes a topological sort algorithm to trigger a cascading recomputation (VE-01). Crucially, the engine strictly limits this re-evaluation to the precise sub-graph affected by the mutated node.13 This smart re-evaluation caching, mirroring the optimization strategies of SurveyJS, allows UDFA to maintain millisecond responsiveness even in massive, multi-thousand-field enterprise or federal grant forms where hundreds of calculations interconnect.13

### **4.3 Repeatable Contexts and Array Manipulation**

Repeatable sections (one-to-many relationships) require specialized expression semantics (FL-03). UDFA natively supports array manipulation and scoped contexts without requiring complex JSONPath traversals. When an expression is defined within a repeat block, any reference using the ${field\_name} syntax implicitly refers to the field within the current local iteration of the array. To access adjacent rows, JEXL-F adopts relative prefixes akin to ${prevRow.field} or ${nextRow.field}.23

For aggregation, JEXL-F includes built-in functions specifically optimized for array reduction: sum(), count(), min(), and max(). Calculating a grand total from a dynamic array of line items utilizes the syntax sum(${line\_items\[\*\].row\_total}), closely mapping to the intuitive projection paradigms found in JMESPath.24 This standardizes field-group-level validation and line-item totaling natively (VS-02).

## **5\. The Validation Model: Decoupling Definition and Execution**

Validation in UDFA fundamentally shifts away from inline, hard-coded schema assertions toward a detached, shape-based validation model inspired by W3C SHACL.9 Validation rules (Shapes) are defined independently of the structural schema and evaluated against the data instance to produce a highly structured validation report.

### **5.1 Constraint Composition and Multi-Tiered Severities**

UDFA supports SHACL-like constraint composition, allowing the construction of complex validation logic utilizing and, or, xone (exactly one), and not operators.9 Every constraint shape must declare a specific severity level, which fundamentally dictates the lifecycle of the form submission and the ultimate state of validity (VR-01, VX-02).

| Severity Level | System Behavior | Semantic Meaning |
| :---- | :---- | :---- |
| Error | Blocks final submission. Flips is\_valid flag to false. | A strict violation of structural integrity or core business rules (e.g., required field empty, cross-section budget totals do not balance) (VS-03). |
| Warning | Advisory only. Does not block submission. | Data appears anomalous but mathematically possible (e.g., a year-over-year revenue drop exceeding 40% triggering a prior-year comparison rule) (VS-04, VE-03). |
| Info | Informational only. Does not block submission. | Contextual feedback, policy reminders, or guidance resulting from specific complex data combinations. |

### **5.2 Validation Modes and Lifecycle Control**

To prevent the hostile user experience of premature validation errors flooding a user interface, UDFA introduces runtime Validation Modes controlled by the host application (VE-05), mirroring concepts from JSON Forms.26

The primary modes include ValidateAndShow (rules execute and the UI is instructed to render the result), ValidateAndHide (rules execute to update the backend state, but the UI suppresses visual feedback to avoid interrupting active data entry), and NoValidation (the engine bypasses constraint checks entirely, utilized for initial data loads or draft saves). Crucially, the UDFA specification mandates that saving incomplete sections must never be blocked by validation states; validation execution is entirely decoupled from draft state persistence mechanisms.

### **5.3 Structured Validation Results and External Injection**

When a validation shape is violated, the UDFA engine does not merely return a boolean flag or a flat string. It generates a comprehensive ValidationResult object, structured to be consumable by user interfaces, headless APIs, PDF generators, or analytics engines without requiring those systems to parse the internal validation rules (VX-01, VX-03).

The structured result object includes:

* focusNode: The precise JSON path to the specific field or group violating the rule.  
* severity: The designated severity (Error, Warning, Info).  
* message: A human-readable, inline explanatory message tied to the constraint failure (VE-04).  
* sourceShape: A machine-readable identifier of the violated rule for analytics tracking.  
* value: The exact invalid data term that triggered the failure at the moment of evaluation.

Furthermore, enterprise environments frequently execute validation logic that cannot be performed entirely client-side, such as third-party API identity checks or legacy database verifications (VE-06). UDFA establishes a standardized protocol for external error injection. External systems can return an array of ValidationResult objects matching the exact schema of the internal engine.26 The controller seamlessly merges these external results into the unified validation report, ensuring that internal schema-derived errors and external API checks are structurally indistinguishable to the consuming application.

## **6\. Form Identity, Versioning, and Schema Evolution**

Complex data collection, particularly in government or clinical settings, requires rigorous audit trails. A form definition cannot simply be overwritten; existing responses must remain cryptographically tied to the exact logic, wording, and schema that existed at the moment of data entry. UDFA solves the schema evolution problem by implementing FHIR R5 Questionnaire versioning and Structured Data Capture (SDC) semantics.10

### **6.1 Canonical Identity and the Status Lifecycle**

Every FormDefinition in UDFA is identified by a globally unique Canonical URL, establishing its namespace.28 Multiple versions of a form can coexist simultaneously in a system (VC-01, VC-03). Version resolution is governed by a defined versionAlgorithm (e.g., semantic versioning).29

The lifecycle of a form definition is strictly governed by a status property 11:

* draft: The definition is actively being authored. It is mutable and unsafe for production responses.  
* active: The definition is published for production use. It becomes strictly immutable; any structural or logical changes necessitate the generation of a new semantic version.  
* retired: The definition is retained for historical response resolution and auditing but is actively blocked from generating new submissions.

### **6.2 Response Pinning**

A FormResponse instance must unconditionally pin itself to the exact version of the definition it was generated against (VC-02). This is achieved through a derivedFrom property within the response metadata, pointing to the canonical URL and explicit version string of the definition.30 When an auditing system retrieves an archived response five years later, it utilizes this pinning to fetch the historically accurate definition. This ensures historical data is rendered, calculated, and validated accurately according to the rules of the past, fully insulating the archive from breaking changes in newer schemas.

### **6.3 Modular Composition and Form Variants**

To support large-scale organizations maintaining hundreds of overlapping reporting requirements, UDFA supports modular composition via an $assemble architectural pattern.15 A parent FormDefinition can declare sub-form dependencies pointing to modular, canonical components (e.g., a standardized "Organization Demographics" or "Financial Assurances" block).32

During initialization, the UDFA controller executes an assembly algorithm that resolves these canonical references, dynamically propagates the items into the parent form, prevents namespace collisions by automatically scoping the imported node IDs, and generates a flattened, executable artifact.15 The final assembled artifact receives an assembledFrom metadata extension, tracing its constituent parts for provenance. This mechanism allows organizations to derive numerous form variants (e.g., a "Long Form" and a "Short Form" variant) from a single common base of modular definitions (VC-04).

## **7\. Concrete Resolution of Hard Cases**

The true test of a declarative standard is its ability to handle complex enterprise edge cases natively in JSON without resorting to custom imperative code. The following sections detail how UDFA expresses severe requirements by coordinating the Instance, BindGraph, and ValidationShape models.

### **7.1 Budget Line Items Summing to a Target**

This case requires repeatable sections, subtotal calculations per row, a cross-row aggregation expression, and a cross-instance validation constraint verifying the calculated total against a cryptographically locked, pre-populated external award amount.

JSON

{  
  "id": "grant\_budget\_definition",  
  "url": "<https://standards.gov/forms/budget>",  
  "version": "1.0.0",  
  "status": "active",  
  "instances": {  
    "primary": { "type": "object", "properties": {} },  
    "award\_data": { "type": "external", "source": "/api/awards/123", "locked": true }  
  },  
  "binds": \[  
    {  
      "nodeset": "budget.line\_items\[\*\].row\_total",  
      "calculate": "${row.unit\_cost} \* ${row.quantity}",  
      "readonly": "true"  
    },  
    {  
      "nodeset": "budget.grand\_total",  
      "calculate": "sum(${budget.line\_items\[\*\].row\_total})",  
      "readonly": "true"  
    }  
  \],  
  "shapes":  
}

**Execution Narrative:** The binding architecture initializes the graph. Whenever a user mutates a unit\_cost or quantity inside the array, the local row\_total calculation is triggered. The topological sort then identifies that budget.grand\_total depends on row\_total and triggers the sum() aggregation. Finally, the validation engine evaluates shape\_budget\_match. Because award\_data is marked as external and locked, the user cannot manipulate the target constraint. If the sum deviates, an Error is generated, preventing submission.

### **7.2 Conditional Section with Dependent Validation**

This case demonstrates conditional visibility (FL-01) and the strict execution of the non-relevant data exclusion rule (FL-02).

JSON

{  
  "binds": \[  
    {  
      "nodeset": "screener.has\_subrecipients",  
      "type": "boolean"  
    },  
    {  
      "nodeset": "subrecipient\_details",  
      "relevant": "${screener.has\_subrecipients} \== true"  
    },  
    {  
      "nodeset": "subrecipient\_details.uei\_number",  
      "required": "true"  
    }  
  \]  
}

**Execution Narrative:** If the user sets has\_subrecipients to false, the relevant expression on the subrecipient\_details group evaluates to false. The UDFA engine immediately marks the entire group and all its descendant nodes as non-relevant. Consequently, the required constraint on the uei\_number is bypassed entirely, preventing false-positive validation errors that plague naive form systems. When the data instance is serialized for final submission, the subrecipient\_details object is recursively pruned from the JSON payload, ensuring perfect database hygiene.

### **7.3 Year-Over-Year Change Warning**

This case leverages secondary instances and the multi-tiered severity model to provide advisory warnings based on historical thresholds (VS-04, VE-03).

JSON

{  
  "instances": {  
    "prior\_year": { "source": "/api/responses/prior", "locked": true }  
  },  
  "shapes":  
}

**Execution Narrative:** The engine parses the mathematical constraint establishing a 50% variance boundary using the locked prior\_year instance data. If the current user input breaches this boundary, the shape evaluates to false. Because the shape is explicitly flagged with a Warning severity, the controller populates the ValidationResult and flags the UI to display the advisory message. However, the internal is\_valid state remains true, and the validation framework will not block the final state transition to submission.

### **7.4 Screener Routing to Variants**

Complex forms often require "screener" sections that dictate the subsequent flow of the document (FL-05). UDFA models this using the relevant MIP applied to high-level group nodes.

JSON

{  
  "binds": \[  
    {  
      "nodeset": "screener.risk\_level",  
      "type": "choice"  
    },  
    {  
      "nodeset": "variant\_short\_form",  
      "relevant": "${screener.risk\_level} \== 'low'"  
    },  
    {  
      "nodeset": "variant\_long\_form",  
      "relevant": "${screener.risk\_level} \== 'high'"  
    }  
  \]  
}

**Execution Narrative:** Unlike FHIR's enableWhen, which is limited to simple direct assertions, UDFA relies entirely on expression-based conditionals.12 As the user answers the screener, the top-level form variants evaluate their relevance. If variant\_short\_form becomes relevant, variant\_long\_form becomes non-relevant. The engine prunes the long-form data entirely and safely suppresses all constraints and required flags encapsulated within the high-risk variant.

### **7.5 External Validation Failure Injection**

When an external system performs an asynchronous check, the controller must inject the result into the standard UDFA output format.26

JSON

{  
  "validationReport":  
}

**Execution Narrative:** This JSON payload demonstrates how purely schema-derived errors (like shape\_budget\_match) coexist natively with injected external API errors (ext\_api\_check). The host application receives a unified array of ValidationResult objects. The UI layer simply iterates over this report to highlight fields, completely agnostic to whether the error was computed in the browser's AST or flagged by a remote backend service.

### **7.6 Auto-Calculated Fields Referencing Repeatable Contexts**

Demonstrating complex JEXL-F calculations (FT-04) that rely on external variables and iterative processing.

JSON

{  
  "binds": \[  
    {  
      "nodeset": "travel.per\_diem\_rate",  
      "calculate": "instance('federal\_rates').get\_rate(${travel.destination\_zip})",  
      "readonly": "true"  
    },  
    {  
      "nodeset": "travel.trips\[\*\].total\_allowance",  
      "calculate": "${row.days} \* ${travel.per\_diem\_rate}"  
    }  
  \]  
}

**Execution Narrative:** The per\_diem\_rate dynamically queries a secondary instance using a custom extension function get\_rate(). The trips array utilizes the row. syntax to scope the calculation to the specific iteration's days value, multiplying it against the globally scoped per\_diem\_rate. If the user changes the destination zip, the DAG engine automatically traces the dependency path, updates the per diem rate, and cascades the recalculation down into every individual trip row automatically.

## **8\. Authoring, Extensibility, and Future-Proofing**

A standard cannot achieve universal adoption if it requires forking the core protocol to address niche domain requirements. UDFA provides strict extension points designed to preserve forward compatibility while enabling deep domain customization.

### **8.1 Schema-Driven and Domain-Agnostic Design**

Because the entirety of UDFA relies on valid JSON architectures rather than hard-coded imperative code, it fundamentally acts as pure data (AD-01). This schema-driven nature makes it natively compatible with visual, no-code authoring environments (AD-02). A drag-and-drop builder merely acts as a visual generator that constructs nodes, writes JEXL-F strings, and serializes its output into the standard UDFA FormDefinition JSON structure. The resulting schema remains entirely program-agnostic (AD-03), capable of being evaluated by a Python backend, a JavaScript web client, or a Go microservice with exactly the same deterministic results.

### **8.2 Safe Extensibility Points**

Organizations implementing UDFA can define domain-specific data types, custom JEXL-F functions, and bespoke validation components without modifying the core specification (AD-04).

If a specific healthcare agency requires a complex cryptographic calculation—such as verify\_npi\_checksum()—they can register this function within their specific controller context.20 The UDFA standard facilitates this by treating the JEXL-F function registry as an open interface. Similarly, new semantic field types (e.g., biometric\_signature) can be introduced into the definition schema. Because the UDFA model strictly separates layout and visual rendering from the logic definition, an unknown field type gracefully degrades in the validation engine; the engine simply applies standard string validation and allows the unknown type to pass through, preserving the integrity of the data payload without throwing fatal exceptions.

### **8.3 Bi-directional Mapping and System Integration**

Drawing critical inspiration from the CommonGrants bidirectional mapping DSL, UDFA definitions can be directly coupled with integration mapping schemas.35 This allows the standard to interface bidirectionally with legacy databases and REST APIs without requiring middle-tier transformation scripts.

A MappingSchema acts as a declarative translation layer, using MappingFieldFunction and MappingSwitchFunction instructions to route data from internal system endpoints into the expected UDFA DataInstance structures, and conversely mapping form outputs back to proprietary backend structures.36 This effectively isolates the universal form standard from the idiosyncrasies of external data schemas, ensuring that form definitions remain portable across entirely different tech stacks.

## **9\. Synthesis and Architectural Conclusion**

The Universal Declarative Form Architecture (UDFA) represents a comprehensive modernization of declarative form logic. By systematically extracting the reactive binding power of XForms, translating it into a format-agnostic JSON-native syntax, and reinforcing it with an ecosystem informed by SHACL's validation decoupling and FHIR's robust versioning semantics, UDFA eliminates the fragmented, piecemeal approaches currently dominating the development landscape.

The architecture guarantees that highly complex enterprise logic—ranging from multi-tiered financial aggregations to strict, warning-driven historical comparisons—can be expressed entirely as deterministic JSON data. Through the rigorous separation of definition from execution, and structural schema from behavioral constraint, UDFA provides a highly durable, scalable, and standardized format. It fulfills the theoretical promise of a "JSON-LD for XForms," establishing a foundational protocol capable of supporting the most demanding and dynamic data collection frameworks globally.

#### **Works cited**

1. A Data-Driven Approach using XForms for Building a Web Forms Generation Framework \- Balisage: The Markup Conference, accessed February 19, 2026, [https://www.balisage.net/Proceedings/vol10/html/Velasquez01/BalisageVol10-Velasquez01.html](https://www.balisage.net/Proceedings/vol10/html/Velasquez01/BalisageVol10-Velasquez01.html)  
2. XForms 2.0 \- W3C XForms Group Wiki (Public), accessed February 19, 2026, [https://www.w3.org/MarkUp/Forms/wiki/XForms\_2.0](https://www.w3.org/MarkUp/Forms/wiki/XForms_2.0)  
3. Json \- W3C XForms Group Wiki (Public), accessed February 19, 2026, [https://www.w3.org/MarkUp/Forms/wiki/Json](https://www.w3.org/MarkUp/Forms/wiki/Json)  
4. Is XForms still a standard that is being implemented and developed, or is there an alternative in place or being developed? \- Stack Overflow, accessed February 19, 2026, [https://stackoverflow.com/questions/40325231/is-xforms-still-a-standard-that-is-being-implemented-and-developed-or-is-there](https://stackoverflow.com/questions/40325231/is-xforms-still-a-standard-that-is-being-implemented-and-developed-or-is-there)  
5. JSON Forms: More forms. Less code., accessed February 19, 2026, [https://jsonforms.io/](https://jsonforms.io/)  
6. JSON-LD Playground, accessed February 19, 2026, [https://json-ld.org/playground/](https://json-ld.org/playground/)  
7. JSON-LD Best Practices, accessed February 19, 2026, [https://w3c.github.io/json-ld-bp/](https://w3c.github.io/json-ld-bp/)  
8. XForms 2.0 \- XForms Users Community Group \- W3C, accessed February 19, 2026, [https://www.w3.org/community/xformsusers/wiki/XForms\_2.0](https://www.w3.org/community/xformsusers/wiki/XForms_2.0)  
9. Shapes Constraint Language (SHACL) \- W3C, accessed February 19, 2026, [https://www.w3.org/TR/shacl/](https://www.w3.org/TR/shacl/)  
10. Questionnaire \- FHIR v6.0.0-ballot3 \- FHIR specification, accessed February 19, 2026, [https://build.fhir.org/questionnaire.html](https://build.fhir.org/questionnaire.html)  
11. Versioning | Aidbox Docs \- Health Samurai, accessed February 19, 2026, [https://www.health-samurai.io/docs/aidbox/modules/aidbox-forms/aidbox-ui-builder-alpha/form-creation/versioning](https://www.health-samurai.io/docs/aidbox/modules/aidbox-forms/aidbox-ui-builder-alpha/form-creation/versioning)  
12. Enable when expression \- Structured Data Capture v4.0.0 \- FHIR, accessed February 19, 2026, [https://build.fhir.org/ig/HL7/sdc/en/StructureDefinition-sdc-questionnaire-enableWhenExpression.html](https://build.fhir.org/ig/HL7/sdc/en/StructureDefinition-sdc-questionnaire-enableWhenExpression.html)  
13. SurveyJS Architecture Guide \- JavaScript UI libraries for forms and surveys, accessed February 19, 2026, [https://surveyjs.io/documentation/surveyjs-architecture](https://surveyjs.io/documentation/surveyjs-architecture)  
14. SurveyJS Architecture Guide \- JavaScript UI libraries for forms and ..., accessed February 19, 2026, [https://surveyjs.io/documentation/surveyjs-architecture\#expression-engine](https://surveyjs.io/documentation/surveyjs-architecture#expression-engine)  
15. Assemble Modular Questionnaire Operation \- Structured Data Capture v4.0.0-snapshot \- FHIR specification, accessed February 19, 2026, [https://build.fhir.org/ig/HL7/sdc/en/OperationDefinition-Questionnaire-assemble.html](https://build.fhir.org/ig/HL7/sdc/en/OperationDefinition-Questionnaire-assemble.html)  
16. Pre-population \- Smart Forms, accessed February 19, 2026, [https://smartforms.csiro.au/docs/sdc/population](https://smartforms.csiro.au/docs/sdc/population)  
17. SDC Extract / Pre-populate \- FHIR DevDays, accessed February 19, 2026, [https://www.devdays.com/wp-content/uploads/2023/08/230608\_BrianPostlethwaite\_SDCExtract.pdf](https://www.devdays.com/wp-content/uploads/2023/08/230608_BrianPostlethwaite_SDCExtract.pdf)  
18. XForms 2.0: XPath expression module \- W3C, accessed February 19, 2026, [https://www.w3.org/TR/xforms-xpath/Overview-diff.html](https://www.w3.org/TR/xforms-xpath/Overview-diff.html)  
19. XLSForm \- ODK Docs, accessed February 19, 2026, [https://docs.getodk.org/xlsform/](https://docs.getodk.org/xlsform/)  
20. google/cel-spec: Common Expression Language ... \- GitHub, accessed February 19, 2026, [https://github.com/google/cel-spec](https://github.com/google/cel-spec)  
21. A Meta Representation for Reactive Dependency Graphs \- UBC Computer Science, accessed February 19, 2026, [https://www.cs.ubc.ca/\~ritschel/files/masterthesis.pdf](https://www.cs.ubc.ca/~ritschel/files/masterthesis.pdf)  
22. Reactive Vega: A Streaming Dataflow Architecture for Declarative Interactive Visualization, accessed February 19, 2026, [https://vis.csail.mit.edu/pubs/reactive-vega.pdf](https://vis.csail.mit.edu/pubs/reactive-vega.pdf)  
23. Expression Syntax \- SurveyJS, accessed February 19, 2026, [https://surveyjs.io/survey-creator/documentation/end-user-guide/expression-syntax](https://surveyjs.io/survey-creator/documentation/end-user-guide/expression-syntax)  
24. JMESPath Tutorial, accessed February 19, 2026, [https://jmespath.org/tutorial.html](https://jmespath.org/tutorial.html)  
25. A Gentle Introduction to JMESPath — an intuitive way to parse JSON documents \- Medium, accessed February 19, 2026, [https://medium.com/toyota-connected-india/a-gentle-introduction-to-jmespath-an-intuitive-way-to-parse-json-documents-daa6d699467a](https://medium.com/toyota-connected-india/a-gentle-introduction-to-jmespath-an-intuitive-way-to-parse-json-documents-daa6d699467a)  
26. Validation \- JSON Forms, accessed February 19, 2026, [https://jsonforms.io/docs/validation](https://jsonforms.io/docs/validation)  
27. Allow the insertion of errors from outside JSONSchema validation · Issue \#155 \- GitHub, accessed February 19, 2026, [https://github.com/rjsf-team/react-jsonschema-form/issues/155](https://github.com/rjsf-team/react-jsonschema-form/issues/155)  
28. How to choose the right canonical URL for your FHIR specification \- Firely, accessed February 19, 2026, [https://fire.ly/blog/how-to-choose-the-right-canonical-url-for-your-fhir-specification/](https://fire.ly/blog/how-to-choose-the-right-canonical-url-for-your-fhir-specification/)  
29. CanonicalResource \- FHIR v6.0.0-ballot3, accessed February 19, 2026, [https://build.fhir.org/canonicalresource.html](https://build.fhir.org/canonicalresource.html)  
30. Structure Definition: QuestionnaireResponse Profile \- Simplifier.net, accessed February 19, 2026, [https://simplifier.net/guide/signal-implementation-guide/Index/FHIR-Artifacts/Structure-Definition--QuestionnaireResponse-Profile?version=0.2.0](https://simplifier.net/guide/signal-implementation-guide/Index/FHIR-Artifacts/Structure-Definition--QuestionnaireResponse-Profile?version=0.2.0)  
31. SDC Standard Questionnaire Response \- Structured Data Capture v4.0.0-snapshot, accessed February 19, 2026, [https://build.fhir.org/ig/HL7/sdc/en/StructureDefinition-sdc-questionnaireresponse.html](https://build.fhir.org/ig/HL7/sdc/en/StructureDefinition-sdc-questionnaireresponse.html)  
32. Modular Forms \- Structured Data Capture v4.0.0-snapshot \- FHIR specification, accessed February 19, 2026, [https://build.fhir.org/ig/HL7/sdc/en/modular.html](https://build.fhir.org/ig/HL7/sdc/en/modular.html)  
33. Example $assemble operation response \- Structured Data Capture v4.0.0, accessed February 19, 2026, [https://build.fhir.org/ig/HL7/sdc/en/Parameters-sdc-modular-root-assembled.html](https://build.fhir.org/ig/HL7/sdc/en/Parameters-sdc-modular-root-assembled.html)  
34. Support enableWhenExpression · Issue \#819 · google/android-fhir \- GitHub, accessed February 19, 2026, [https://github.com/google/android-fhir/issues/819](https://github.com/google/android-fhir/issues/819)  
35. Schema mapping format \- CommonGrants, accessed February 19, 2026, [https://commongrants.org/governance/adr/0017-mapping-format/](https://commongrants.org/governance/adr/0017-mapping-format/)  
36. Mapping | CommonGrants, accessed February 19, 2026, [https://commongrants.org/protocol/models/mapping/](https://commongrants.org/protocol/models/mapping/)
