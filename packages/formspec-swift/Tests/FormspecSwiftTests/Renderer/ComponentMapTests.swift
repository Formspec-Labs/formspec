/// @filedesc ComponentMapTests — unit tests for ComponentMap registration and replacement.

import Testing
import SwiftUI
@testable import FormspecSwift

// MARK: - Fixture components (used in replacement tests)

private struct FakeTextInput: FieldComponent {
    let state: FieldState
    let node: LayoutNode

    init(state: FieldState, node: LayoutNode) {
        self.state = state
        self.node = node
    }

    var body: some View {
        Text("FakeTextInput: \(state.label)")
    }
}

private struct FakeStack: LayoutComponent {
    let node: LayoutNode
    let children: [AnyView]

    init(node: LayoutNode, children: [AnyView]) {
        self.node = node
        self.children = children
    }

    var body: some View {
        VStack { ForEach(0..<children.count, id: \.self) { children[$0] } }
    }
}

// MARK: - ComponentMapTests

@Suite("ComponentMap")
struct ComponentMapTests {

    // MARK: - testDefaultMapHasTextInput

    @Test("defaults contains TextInput field component")
    func testDefaultMapHasTextInput() {
        let map = ComponentMap.defaults
        #expect(map.fields["TextInput"] != nil)
    }

    // MARK: - testDefaultMapHasNumberInput

    @Test("defaults contains NumberInput field component")
    func testDefaultMapHasNumberInput() {
        let map = ComponentMap.defaults
        #expect(map.fields["NumberInput"] != nil)
    }

    // MARK: - testDefaultMapHasToggle

    @Test("defaults contains Toggle field component")
    func testDefaultMapHasToggle() {
        let map = ComponentMap.defaults
        #expect(map.fields["Toggle"] != nil)
    }

    // MARK: - testDefaultMapHasSelect

    @Test("defaults contains Select field component")
    func testDefaultMapHasSelect() {
        let map = ComponentMap.defaults
        #expect(map.fields["Select"] != nil)
    }

    // MARK: - testDefaultMapHasCheckboxGroup

    @Test("defaults contains CheckboxGroup field component")
    func testDefaultMapHasCheckboxGroup() {
        let map = ComponentMap.defaults
        #expect(map.fields["CheckboxGroup"] != nil)
    }

    // MARK: - testDefaultMapHasRadioGroup

    @Test("defaults contains RadioGroup field component")
    func testDefaultMapHasRadioGroup() {
        let map = ComponentMap.defaults
        #expect(map.fields["RadioGroup"] != nil)
    }

    // MARK: - testDefaultMapHasDatePicker

    @Test("defaults contains DatePicker field component")
    func testDefaultMapHasDatePicker() {
        let map = ComponentMap.defaults
        #expect(map.fields["DatePicker"] != nil)
    }

    // MARK: - testDefaultMapRejectsNonCanonicalAliases

    @Test("defaults do not register non-canonical field aliases")
    func testDefaultMapRejectsNonCanonicalAliases() {
        let map = ComponentMap.defaults
        #expect(map.fields["TextArea"] == nil)
        #expect(map.fields["Checkbox"] == nil)
        #expect(map.fields["MultiSelect"] == nil)
        #expect(map.fields["DateInput"] == nil)
    }

    // MARK: - testDefaultMapHasStack

    @Test("defaults contains Stack layout component")
    func testDefaultMapHasStack() {
        let map = ComponentMap.defaults
        #expect(map.layout["Stack"] != nil)
    }

    // MARK: - testDefaultMapHasCard

    @Test("defaults contains Card layout component")
    func testDefaultMapHasCard() {
        let map = ComponentMap.defaults
        #expect(map.layout["Card"] != nil)
    }

    // MARK: - testDefaultMapHasGrid

    @Test("defaults contains Grid layout component")
    func testDefaultMapHasGrid() {
        let map = ComponentMap.defaults
        #expect(map.layout["Grid"] != nil)
    }

    // MARK: - testDefaultMapHasSection

    @Test("defaults contains Section layout component")
    func testDefaultMapHasSection() {
        let map = ComponentMap.defaults
        #expect(map.layout["Section"] != nil)
    }

    // MARK: - testDefaultMapHasWizard

    @Test("defaults contains Wizard layout component")
    func testDefaultMapHasWizard() {
        let map = ComponentMap.defaults
        #expect(map.layout["Wizard"] != nil)
    }

    // MARK: - testReplacingFieldComponent

    @Test("replacing field component returns updated map without mutating original")
    func testReplacingFieldComponent() {
        let original = ComponentMap.defaults
        let updated = original.replacing(field: "TextInput", with: FakeTextInput.self)

        // Updated map has replacement
        let updatedType = updated.fields["TextInput"]
        #expect(updatedType != nil)
        #expect(updatedType == FakeTextInput.self)

        // Original is unchanged
        let originalType = original.fields["TextInput"]
        #expect(originalType != nil)
        #expect(originalType != FakeTextInput.self)
    }

    // MARK: - testReplacingFieldComponentAddsNew

    @Test("replacing can add a new field key that was not in defaults")
    func testReplacingFieldComponentAddsNew() {
        let map = ComponentMap.defaults.replacing(field: "CustomWidget", with: FakeTextInput.self)
        #expect(map.fields["CustomWidget"] != nil)
    }

    // MARK: - testReplacingLayoutComponent

    @Test("replacing layout component returns updated map without mutating original")
    func testReplacingLayoutComponent() {
        let original = ComponentMap.defaults
        let updated = original.replacing(layout: "Stack", with: FakeStack.self)

        // Updated map has replacement
        let updatedType = updated.layout["Stack"]
        #expect(updatedType != nil)
        #expect(updatedType == FakeStack.self)

        // Original is unchanged (different type)
        let originalType = original.layout["Stack"]
        #expect(originalType != nil)
        #expect(originalType != FakeStack.self)
    }

    // MARK: - testReplacingLayoutComponentAddsNew

    @Test("replacing can add a new layout key not in defaults")
    func testReplacingLayoutComponentAddsNew() {
        let map = ComponentMap.defaults.replacing(layout: "CustomLayout", with: FakeStack.self)
        #expect(map.layout["CustomLayout"] != nil)
    }

    // MARK: - testDefaultMapFieldCount

    @Test("defaults has exactly 7 field components")
    func testDefaultMapFieldCount() {
        #expect(ComponentMap.defaults.fields.count == 7)
    }

    // MARK: - testDefaultMapLayoutCount

    @Test("defaults has exactly 5 layout components")
    func testDefaultMapLayoutCount() {
        #expect(ComponentMap.defaults.layout.count == 5)
    }
}
