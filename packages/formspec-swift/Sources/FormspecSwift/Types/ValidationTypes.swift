/// @filedesc Validation report, result, severity, and summary types.

import Foundation

/// The full validation report returned by the engine after evaluating a response.
public struct ValidationReport: Codable, Sendable {
    public let results: [ResolvedValidationResult]
    public let isValid: Bool

    private enum CodingKeys: String, CodingKey {
        case results
        case isValid
        case valid
    }

    public init(results: [ResolvedValidationResult], isValid: Bool) {
        self.results = results
        self.isValid = isValid
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        results = try container.decode([ResolvedValidationResult].self, forKey: .results)
        if let valid = try container.decodeIfPresent(Bool.self, forKey: .valid) {
            isValid = valid
        } else {
            isValid = try container.decode(Bool.self, forKey: .isValid)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(results, forKey: .results)
        try container.encode(isValid, forKey: .isValid)
    }
}

/// A single validation result targeting a specific path (or the whole form).
public struct ResolvedValidationResult: Codable, Equatable, Sendable {
    public let path: String?
    public let message: String
    public let severity: ValidationSeverity
    public let constraintKind: String?
    public let code: String?

    public init(
        path: String?,
        message: String,
        severity: ValidationSeverity,
        constraintKind: String?,
        code: String?
    ) {
        self.path = path
        self.message = message
        self.severity = severity
        self.constraintKind = constraintKind
        self.code = code
    }
}

/// Severity level for a validation result.
public enum ValidationSeverity: String, Codable, Sendable {
    case error
    case warning
    case info
}

/// Aggregated counts of results by severity, suitable for driving UI indicators.
public struct ValidationSummary: Equatable, Sendable {
    public let errors: Int
    public let warnings: Int
    public let infos: Int

    public init(errors: Int, warnings: Int, infos: Int) {
        self.errors = errors
        self.warnings = warnings
        self.infos = infos
    }
}
