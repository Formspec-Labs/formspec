/// @filedesc Field-level supporting types: ResolvedOption, DisabledDisplay, ValidationProfile.

import Foundation

/// A resolved choice option with a typed value and display label.
public struct ResolvedOption: Codable, Equatable, Sendable {
    public let value: JSONValue
    public let label: String

    public init(value: JSONValue, label: String) {
        self.value = value
        self.label = label
    }
}

/// How a disabled field is shown to the user.
public enum DisabledDisplay: String, Codable, Sendable {
    /// Field is not rendered at all.
    case hidden
    /// Field is rendered but its value is obscured.
    case protected
}

/// Validation profile used when requesting engine validation results.
public enum ValidationProfile: String, Codable, Sendable {
    /// Continuous validation across non-demand-timing shapes.
    case live
    /// Validation scoped to continuous and submit-timing shapes.
    case onSubmit = "on-submit"
    /// Validation scoped to demand-timing shapes.
    case onDemand = "on-demand"
    /// No validation report is produced.
    case off
}
