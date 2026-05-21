/// @filedesc DefaultLayoutComponents — built-in SwiftUI implementations of LayoutComponent for all standard layout types.

import SwiftUI

// MARK: - JSONValue string extraction helper

private extension [String: JSONValue] {
    /// Return a `String` value for `key`, or `nil` if absent or not a string.
    func string(_ key: String) -> String? {
        guard case .string(let s) = self[key] else { return nil }
        return s
    }

    /// Return an `Int` value for `key`, or `nil` if absent or not a number.
    func int(_ key: String) -> Int? {
        guard case .number(let n) = self[key] else { return nil }
        return Int(n)
    }
}

// MARK: - DefaultStack

/// Default vertical or horizontal stack.
///
/// Reads `node.props["direction"]`: `"horizontal"` → `HStack`, anything else → `VStack`.
public struct DefaultStack: LayoutComponent {
    public let node: LayoutNode
    public let children: [AnyView]

    public init(node: LayoutNode, children: [AnyView]) {
        self.node = node
        self.children = children
    }

    public var body: some View {
        let direction = node.props.string("direction") ?? "vertical"
        if direction == "horizontal" {
            HStack(alignment: .top) {
                ForEach(0..<children.count, id: \.self) { index in
                    children[index]
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(0..<children.count, id: \.self) { index in
                    children[index]
                }
            }
        }
    }
}

// MARK: - DefaultCard

/// Default card container rendered as a `GroupBox`.
///
/// Reads `node.props["title"]` for the optional card title.
public struct DefaultCard: LayoutComponent {
    public let node: LayoutNode
    public let children: [AnyView]

    public init(node: LayoutNode, children: [AnyView]) {
        self.node = node
        self.children = children
    }

    public var body: some View {
        let title = node.props.string("title")
        if let title = title {
            GroupBox(label: Text(title).font(.headline)) {
                content
            }
        } else {
            GroupBox {
                content
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(0..<children.count, id: \.self) { index in
                children[index]
            }
        }
    }
}

// MARK: - DefaultGrid

/// Default grid layout using `LazyVGrid`.
///
/// Reads `node.props["columns"]` (Int, default 2) to set the number of columns.
public struct DefaultGrid: LayoutComponent {
    public let node: LayoutNode
    public let children: [AnyView]

    public init(node: LayoutNode, children: [AnyView]) {
        self.node = node
        self.children = children
    }

    public var body: some View {
        let columnCount = node.props.int("columns") ?? 2
        let columns = Array(repeating: GridItem(.flexible()), count: max(1, columnCount))

        LazyVGrid(columns: columns, spacing: 12) {
            ForEach(0..<children.count, id: \.self) { index in
                children[index]
            }
        }
    }
}

// MARK: - DefaultSection

/// Default section container with optional title and description header.
///
/// Reads `node.props["title"]` and `node.props["description"]`.
public struct DefaultSection: LayoutComponent {
    public let node: LayoutNode
    public let children: [AnyView]

    public init(node: LayoutNode, children: [AnyView]) {
        self.node = node
        self.children = children
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let title = node.props.string("title") {
                    Text(title)
                        .font(.title2)
                        .fontWeight(.bold)
                }
                if let description = node.props.string("description") {
                    Text(description)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                ForEach(0..<children.count, id: \.self) { index in
                    children[index]
                }
            }
            .padding()
        }
    }
}

// MARK: - DefaultWizard

/// Default wizard container using a paged `TabView`.
///
/// Each child occupies one tab page.
public struct DefaultWizard: LayoutComponent {
    public let node: LayoutNode
    public let children: [AnyView]

    public init(node: LayoutNode, children: [AnyView]) {
        self.node = node
        self.children = children
    }

    public var body: some View {
        #if os(iOS) || os(visionOS)
        TabView {
            ForEach(0..<children.count, id: \.self) { index in
                children[index]
                    .tag(index)
            }
        }
        .tabViewStyle(.page)
        .indexViewStyle(.page(backgroundDisplayMode: .always))
        #else
        // macOS: render as a vertical stack (paged tab style unavailable on macOS)
        VStack(alignment: .leading, spacing: 16) {
            ForEach(0..<children.count, id: \.self) { index in
                children[index]
            }
        }
        #endif
    }
}
