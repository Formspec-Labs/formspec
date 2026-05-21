/// @filedesc ComponentMap — registry mapping component keys to FieldComponent and LayoutComponent types.

import SwiftUI

// MARK: - FieldComponent

/// A SwiftUI view that renders a single form field given its reactive state and layout node.
///
/// Implement this protocol to provide a custom field renderer. The `init(state:node:)`
/// is called by `FormspecField` for each visible field node in the layout tree.
public protocol FieldComponent: View {
    /// Initialize the component with the field's reactive state and its layout node.
    init(state: FieldState, node: LayoutNode)
}

// MARK: - LayoutComponent

/// A SwiftUI view that renders a layout container node given its props and pre-built children.
///
/// Implement this protocol to provide a custom layout container. The `init(node:children:)`
/// is called by `FormspecLayout` for each layout node in the tree.
public protocol LayoutComponent: View {
    /// Initialize the component with the layout node and its already-rendered children.
    init(node: LayoutNode, children: [AnyView])
}

// MARK: - ComponentMap

/// A registry that maps component key strings to `FieldComponent` and `LayoutComponent` types.
///
/// `ComponentMap.defaults` contains all built-in default components. Use
/// `replacing(field:with:)` and `replacing(layout:with:)` to swap individual
/// entries while keeping everything else intact.
///
/// ```swift
/// let map = ComponentMap.defaults
///     .replacing(field: "TextInput", with: MyTextInput.self)
///     .replacing(layout: "Stack", with: MyStack.self)
/// let form = FormspecForm(engine: engine, components: map)
/// ```
public struct ComponentMap: @unchecked Sendable {

    // MARK: - Properties

    /// Field component types keyed by component name (e.g. `"TextInput"`, `"Select"`).
    public var fields: [String: any FieldComponent.Type]

    /// Layout component types keyed by component name (e.g. `"Stack"`, `"Card"`).
    public var layout: [String: any LayoutComponent.Type]

    // MARK: - Init

    /// Create a `ComponentMap` with explicit field and layout registries.
    public init(
        fields: [String: any FieldComponent.Type],
        layout: [String: any LayoutComponent.Type]
    ) {
        self.fields = fields
        self.layout = layout
    }

    // MARK: - Defaults

    /// A `ComponentMap` populated with all built-in default SwiftUI components.
    ///
    /// Field components: `TextInput`, `NumberInput`, `Toggle`,
    ///   `Select`, `CheckboxGroup`, `RadioGroup`, `DatePicker`.
    ///
    /// Layout components: `Stack`, `Card`, `Grid`, `Section`, `Wizard`.
    public static let defaults = ComponentMap(
        fields: [
            "TextInput":     DefaultTextInput.self,
            "NumberInput":   DefaultNumberInput.self,
            "Toggle":        DefaultToggle.self,
            "Select":        DefaultSelect.self,
            "CheckboxGroup": DefaultCheckboxGroup.self,
            "RadioGroup":    DefaultRadioGroup.self,
            "DatePicker":    DefaultDatePicker.self,
        ],
        layout: [
            "Stack":   DefaultStack.self,
            "Card":    DefaultCard.self,
            "Grid":    DefaultGrid.self,
            "Section": DefaultSection.self,
            "Wizard":  DefaultWizard.self,
        ]
    )

    // MARK: - Replacing

    /// Return a new `ComponentMap` with the field component for `key` replaced.
    ///
    /// If `key` does not exist in the current map, it is added.
    public func replacing(field key: String, with type: any FieldComponent.Type) -> ComponentMap {
        var copy = self
        copy.fields[key] = type
        return copy
    }

    /// Return a new `ComponentMap` with the layout component for `key` replaced.
    ///
    /// If `key` does not exist in the current map, it is added.
    public func replacing(layout key: String, with type: any LayoutComponent.Type) -> ComponentMap {
        var copy = self
        copy.layout[key] = type
        return copy
    }
}
