/// @filedesc FormspecDemoApp — minimal macOS SwiftUI demo app that renders a contact form via FormspecEngine.

import SwiftUI
import FormspecSwift

@main
struct FormspecDemoApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .frame(minWidth: 400, minHeight: 500)
        }
    }
}

struct ContentView: View {
    @State private var engine: FormspecEngine?
    @State private var error: String?
    @State private var isLoading = true

    var body: some View {
        Group {
            if let engine {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        Text(engine.formState.title)
                            .font(.title)

                        if !engine.formState.description.isEmpty {
                            Text(engine.formState.description)
                                .foregroundColor(.secondary)
                        }

                        // Auto-renderer
                        FormspecForm(engine: engine)

                        Divider()

                        // Manual field rendering example
                        manualFieldSection(engine: engine)

                        Divider()

                        // Validation status
                        validationSection(engine: engine)
                    }
                    .padding()
                }
            } else if let error {
                VStack {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.largeTitle)
                        .foregroundColor(.red)
                    Text("Error loading form")
                        .font(.headline)
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding()
            } else {
                ProgressView("Loading form engine...")
                    .padding()
            }
        }
        .task {
            await loadForm()
        }
    }

    @ViewBuilder
    func manualFieldSection(engine: FormspecEngine) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Manual Field Rendering")
                .font(.headline)

            if let name = engine.fieldState(for: "fullName") {
                HStack {
                    Text("fullName value:")
                    Text("\(name.value as? String ?? "(empty)")")
                        .foregroundColor(.blue)
                    if name.required { Text("(required)").foregroundColor(.orange) }
                }
            }

            if let email = engine.fieldState(for: "email") {
                HStack {
                    Text("email value:")
                    Text("\(email.value as? String ?? "(empty)")")
                        .foregroundColor(.blue)
                    if let err = email.firstError {
                        Text(err).foregroundColor(.red)
                    }
                }
            }
        }
    }

    @ViewBuilder
    func validationSection(engine: FormspecEngine) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Validation")
                .font(.headline)
            HStack {
                Text("Valid:")
                Text(engine.formState.isValid ? "Yes" : "No")
                    .foregroundColor(engine.formState.isValid ? .green : .red)
            }
            let s = engine.formState.validationSummary
            Text("Errors: \(s.errors) | Warnings: \(s.warnings) | Infos: \(s.infos)")
                .font(.caption)
        }
    }

    func loadForm() async {
        do {
            // Inline the definition and layout plan
            let definition: JSONValue = .object([
                "$formspec": .string("1.0"),
                "url": .string("urn:formspec:demo:contact"),
                "version": .string("1.0.0"),
                "formId": .string("contact"),
                "title": .string("Contact Form"),
                "items": .array([
                    .object([
                        "key": .string("fullName"),
                        "type": .string("field"),
                        "dataType": .string("string"),
                        "label": .string("Full Name"),
                        "bind": .object(["required": .string("true()")])
                    ]),
                    .object([
                        "key": .string("email"),
                        "type": .string("field"),
                        "dataType": .string("string"),
                        "label": .string("Email"),
                        "bind": .object([
                            "required": .string("true()"),
                            "constraint": .string("regex($value, '^[^@]+@[^@]+$')")
                        ])
                    ]),
                    .object([
                        "key": .string("subscribe"),
                        "type": .string("field"),
                        "dataType": .string("boolean"),
                        "label": .string("Subscribe to newsletter")
                    ])
                ])
            ])

            let layoutPlan: JSONValue = .object([
                "id": .string("root"),
                "component": .string("Stack"),
                "category": .string("layout"),
                "props": .object(["direction": .string("vertical")]),
                "cssClasses": .array([]),
                "children": .array([
                    .object([
                        "id": .string("field-fullName"),
                        "component": .string("TextInput"),
                        "category": .string("field"),
                        "props": .object([:]),
                        "cssClasses": .array([]),
                        "children": .array([]),
                        "bindPath": .string("fullName"),
                        "fieldItem": .object([
                            "key": .string("fullName"),
                            "label": .string("Full Name"),
                            "dataType": .string("string")
                        ]),
                        "labelPosition": .string("top")
                    ]),
                    .object([
                        "id": .string("field-email"),
                        "component": .string("TextInput"),
                        "category": .string("field"),
                        "props": .object([:]),
                        "cssClasses": .array([]),
                        "children": .array([]),
                        "bindPath": .string("email"),
                        "fieldItem": .object([
                            "key": .string("email"),
                            "label": .string("Email"),
                            "dataType": .string("string")
                        ]),
                        "labelPosition": .string("top")
                    ]),
                    .object([
                        "id": .string("field-subscribe"),
                        "component": .string("Toggle"),
                        "category": .string("field"),
                        "props": .object([:]),
                        "cssClasses": .array([]),
                        "children": .array([]),
                        "bindPath": .string("subscribe"),
                        "fieldItem": .object([
                            "key": .string("subscribe"),
                            "label": .string("Subscribe to newsletter"),
                            "dataType": .string("boolean")
                        ]),
                        "labelPosition": .string("top")
                    ])
                ])
            ])

            let bundle = RenderingBundle(
                definition: definition,
                layoutPlan: layoutPlan
            )

            engine = try await FormspecEngine.create(bundle: bundle)
            isLoading = false
        } catch {
            self.error = error.localizedDescription
            isLoading = false
        }
    }
}
