/// @filedesc EngineEvent — events received from the JS engine bridge, with patch types.

import Foundation

// MARK: - FieldStatePatch

/// A partial update to a single field's state.
///
/// All fields are optional — only the changed properties are populated.
/// `touched` is intentionally absent: it is managed purely on the Swift side
/// and never sent back by the JS engine.
public struct FieldStatePatch: Codable, Sendable {
    public let label: String?
    public let hint: String?
    public let description: String?
    public let value: JSONValue?
    public let required: Bool?
    public let visible: Bool?
    public let readonly: Bool?
    public let errors: [ResolvedValidationResult]?
    public let firstError: String?
    public let options: [ResolvedOption]?
    public let optionsLoading: Bool?
    public let optionsError: String?

    public init(
        label: String? = nil,
        hint: String? = nil,
        description: String? = nil,
        value: JSONValue? = nil,
        required: Bool? = nil,
        visible: Bool? = nil,
        readonly: Bool? = nil,
        errors: [ResolvedValidationResult]? = nil,
        firstError: String? = nil,
        options: [ResolvedOption]? = nil,
        optionsLoading: Bool? = nil,
        optionsError: String? = nil
    ) {
        self.label = label
        self.hint = hint
        self.description = description
        self.value = value
        self.required = required
        self.visible = visible
        self.readonly = readonly
        self.errors = errors
        self.firstError = firstError
        self.options = options
        self.optionsLoading = optionsLoading
        self.optionsError = optionsError
    }
}

// MARK: - FormStatePatch

/// A partial update to the overall form state.
///
/// All fields are optional — only the changed properties are populated.
public struct FormStatePatch: Codable, Sendable {
    public let title: String?
    public let description: String?
    public let isValid: Bool?
    public let errors: Int?
    public let warnings: Int?
    public let infos: Int?

    public init(
        title: String? = nil,
        description: String? = nil,
        isValid: Bool? = nil,
        errors: Int? = nil,
        warnings: Int? = nil,
        infos: Int? = nil
    ) {
        self.title = title
        self.description = description
        self.isValid = isValid
        self.errors = errors
        self.warnings = warnings
        self.infos = infos
    }
}

// MARK: - EngineEvent

/// An event received from the JavaScript formspec engine.
///
/// Decoded from flat JSON objects with a `type` discriminator field.
public enum EngineEvent: Decodable, Sendable {
    /// A field's state has changed.
    case fieldStateChanged(path: String, changes: FieldStatePatch)
    /// The overall form state has changed.
    case formStateChanged(changes: FormStatePatch)
    /// A wizard page's metadata has changed.
    case pageStateChanged(pageId: String, title: String, description: String)
    /// The instance count for a repeatable group has changed.
    case repeatChanged(groupName: String, count: Int)
    /// A `getResponse` command produced a result.
    case responseResult(JSONValue)
    /// A `getValidationReport` command produced a result.
    case validationReportResult(ValidationReport?)
    /// The engine finished initializing and is ready to accept commands.
    case engineReady
    /// The engine encountered a fatal error.
    case engineError(message: String)

    // MARK: - Decodable

    private enum TypeKey: String, Decodable {
        case fieldStateChanged
        case formStateChanged
        case pageStateChanged
        case repeatChanged
        case responseResult
        case validationReportResult
        case engineReady
        case engineError
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DynamicCodingKey.self)
        let typeString = try container.decode(String.self, forKey: .key("type"))

        guard let eventType = TypeKey(rawValue: typeString) else {
            throw DecodingError.dataCorruptedError(
                forKey: .key("type"),
                in: container,
                debugDescription: "Unknown EngineEvent type: \(typeString)"
            )
        }

        switch eventType {
        case .fieldStateChanged:
            let path = try container.decode(String.self, forKey: .key("path"))
            let changes = try container.decode(FieldStatePatch.self, forKey: .key("changes"))
            self = .fieldStateChanged(path: path, changes: changes)

        case .formStateChanged:
            let changes = try container.decode(FormStatePatch.self, forKey: .key("changes"))
            self = .formStateChanged(changes: changes)

        case .pageStateChanged:
            let pageId = try container.decode(String.self, forKey: .key("pageId"))
            let title = try container.decode(String.self, forKey: .key("title"))
            let description = try container.decode(String.self, forKey: .key("description"))
            self = .pageStateChanged(pageId: pageId, title: title, description: description)

        case .repeatChanged:
            let groupName = try container.decode(String.self, forKey: .key("groupName"))
            let count = try container.decode(Int.self, forKey: .key("count"))
            self = .repeatChanged(groupName: groupName, count: count)

        case .responseResult:
            let response = try container.decode(JSONValue.self, forKey: .key("response"))
            self = .responseResult(response)

        case .validationReportResult:
            let report = try container.decodeIfPresent(ValidationReport.self, forKey: .key("report"))
            self = .validationReportResult(report)

        case .engineReady:
            self = .engineReady

        case .engineError:
            let message = try container.decode(String.self, forKey: .key("message"))
            self = .engineError(message: message)
        }
    }
}
