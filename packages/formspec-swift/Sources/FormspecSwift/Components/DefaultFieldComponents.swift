/// @filedesc DefaultFieldComponents — built-in SwiftUI implementations of FieldComponent for all standard field types.

import SwiftUI

// MARK: - Shared helpers

/// Returns `"\(label) *"` when `required`, otherwise `label` unchanged.
private func requiredLabel(_ label: String, required: Bool) -> String {
    required ? "\(label) *" : label
}

// MARK: - DefaultTextInput

/// Default single-line text field.
public struct DefaultTextInput: FieldComponent {
    public let state: FieldState
    public let node: LayoutNode

    public init(state: FieldState, node: LayoutNode) {
        self.state = state
        self.node = node
    }

    @State private var text: String = ""

    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(requiredLabel(state.label, required: state.required))
                .font(.subheadline)
                .foregroundColor(.primary)

            if let hint = state.hint {
                Text(hint)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            TextField(state.hint ?? state.label, text: $text)
                .textFieldStyle(.roundedBorder)
                .disabled(state.readonly)
                .accessibilityLabel(state.label)
                .onChange(of: text) { _, newValue in
                    state.setValue(newValue)
                }
                .onAppear {
                    text = (state.value as? String) ?? ""
                }

            if let error = state.firstError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
    }
}

// MARK: - DefaultNumberInput

/// Default numeric input field (decimal pad keyboard).
public struct DefaultNumberInput: FieldComponent {
    public let state: FieldState
    public let node: LayoutNode

    public init(state: FieldState, node: LayoutNode) {
        self.state = state
        self.node = node
    }

    @State private var text: String = ""

    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(requiredLabel(state.label, required: state.required))
                .font(.subheadline)
                .foregroundColor(.primary)

            if let hint = state.hint {
                Text(hint)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            TextField(state.hint ?? state.label, text: $text)
                .textFieldStyle(.roundedBorder)
                #if os(iOS) || os(visionOS)
                .keyboardType(.decimalPad)
                #endif
                .disabled(state.readonly)
                .accessibilityLabel(state.label)
                .onChange(of: text) { _, newValue in
                    if let d = Double(newValue) {
                        state.setValue(d)
                    } else if newValue.isEmpty {
                        state.setValue(nil)
                    }
                }
                .onAppear {
                    if let d = state.value as? Double {
                        text = d.truncatingRemainder(dividingBy: 1) == 0
                            ? String(Int(d))
                            : String(d)
                    }
                }

            if let error = state.firstError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
    }
}

// MARK: - DefaultToggle

/// Default boolean toggle.
public struct DefaultToggle: FieldComponent {
    public let state: FieldState
    public let node: LayoutNode

    public init(state: FieldState, node: LayoutNode) {
        self.state = state
        self.node = node
    }

    @State private var isOn: Bool = false

    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Toggle(requiredLabel(state.label, required: state.required), isOn: $isOn)
                .disabled(state.readonly)
                .accessibilityLabel(state.label)
                .onChange(of: isOn) { _, newValue in
                    state.setValue(newValue)
                }
                .onAppear {
                    isOn = (state.value as? Bool) ?? false
                }

            if let error = state.firstError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
    }
}

// MARK: - DefaultSelect

/// Default single-value picker using a segmented/wheel picker.
public struct DefaultSelect: FieldComponent {
    public let state: FieldState
    public let node: LayoutNode

    public init(state: FieldState, node: LayoutNode) {
        self.state = state
        self.node = node
    }

    @State private var selectedValue: String = ""

    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(requiredLabel(state.label, required: state.required))
                .font(.subheadline)
                .foregroundColor(.primary)

            if let hint = state.hint {
                Text(hint)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Picker(state.label, selection: $selectedValue) {
                Text("Select…").tag("")
                ForEach(state.options, id: \.label) { option in
                    Text(option.label).tag(option.stringValue)
                }
            }
            .disabled(state.readonly)
            .accessibilityLabel(state.label)
            .onChange(of: selectedValue) { _, newValue in
                if newValue.isEmpty {
                    state.setValue(nil)
                } else {
                    state.setValue(newValue)
                }
            }
            .onAppear {
                selectedValue = (state.value as? String) ?? ""
            }

            if let error = state.firstError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
    }
}

// MARK: - DefaultCheckboxGroup

/// Default multi-value selector rendered as a list of toggles.
public struct DefaultCheckboxGroup: FieldComponent {
    public let state: FieldState
    public let node: LayoutNode

    public init(state: FieldState, node: LayoutNode) {
        self.state = state
        self.node = node
    }

    @State private var selected: Set<String> = []

    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(requiredLabel(state.label, required: state.required))
                .font(.subheadline)
                .foregroundColor(.primary)

            if let hint = state.hint {
                Text(hint)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            ForEach(state.options, id: \.label) { option in
                let val = option.stringValue
                Toggle(option.label, isOn: Binding(
                    get: { selected.contains(val) },
                    set: { isSelected in
                        if isSelected {
                            selected.insert(val)
                        } else {
                            selected.remove(val)
                        }
                        state.setValue(Array(selected))
                    }
                ))
                .disabled(state.readonly)
            }

            if let error = state.firstError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
        .accessibilityLabel(state.label)
        .onAppear {
            if let arr = state.value as? [String] {
                selected = Set(arr)
            }
        }
    }
}

// MARK: - DefaultRadioGroup

/// Default radio group rendered as a segmented picker.
public struct DefaultRadioGroup: FieldComponent {
    public let state: FieldState
    public let node: LayoutNode

    public init(state: FieldState, node: LayoutNode) {
        self.state = state
        self.node = node
    }

    @State private var selectedValue: String = ""

    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(requiredLabel(state.label, required: state.required))
                .font(.subheadline)
                .foregroundColor(.primary)

            if let hint = state.hint {
                Text(hint)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Picker(state.label, selection: $selectedValue) {
                ForEach(state.options, id: \.label) { option in
                    Text(option.label).tag(option.stringValue)
                }
            }
            .pickerStyle(.segmented)
            .disabled(state.readonly)
            .accessibilityLabel(state.label)
            .onChange(of: selectedValue) { _, newValue in
                state.setValue(newValue.isEmpty ? nil : newValue)
            }
            .onAppear {
                selectedValue = (state.value as? String) ?? ""
            }

            if let error = state.firstError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
    }
}

// MARK: - DefaultDatePicker

/// Default date picker.
///
/// - Note: Currently uses native `DatePicker`. ISO 8601 string parsing/serialization
///   is a TODO — values are stored as `Date` internally for now.
public struct DefaultDatePicker: FieldComponent {
    public let state: FieldState
    public let node: LayoutNode

    public init(state: FieldState, node: LayoutNode) {
        self.state = state
        self.node = node
    }

    @State private var selectedDate: Date = Date()

    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(requiredLabel(state.label, required: state.required))
                .font(.subheadline)
                .foregroundColor(.primary)

            if let hint = state.hint {
                Text(hint)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            DatePicker(
                state.label,
                selection: $selectedDate,
                displayedComponents: .date
            )
            .labelsHidden()
            .disabled(state.readonly)
            .accessibilityLabel(state.label)
            .onChange(of: selectedDate) { _, newValue in
                // TODO: serialize as ISO 8601 string
                let iso = ISO8601DateFormatter().string(from: newValue)
                state.setValue(iso)
            }
            .onAppear {
                // TODO: parse ISO 8601 string from state.value
                if let isoString = state.value as? String,
                   let date = ISO8601DateFormatter().date(from: isoString) {
                    selectedDate = date
                }
            }

            if let error = state.firstError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
    }
}

// MARK: - ResolvedOption helper

private extension ResolvedOption {
    /// Extracts a `String` tag value from the option's `JSONValue`.
    var stringValue: String {
        switch value {
        case .string(let s): return s
        case .number(let n):
            return n.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(n)) : String(n)
        case .bool(let b):   return b ? "true" : "false"
        default:             return ""
        }
    }
}
