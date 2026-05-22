/// @filedesc EngineCommand — commands sent from Swift to the JS engine bridge.

import Foundation

/// A command sent from Swift to the JavaScript formspec engine.
///
/// All commands serialize as flat JSON objects with a `type` discriminator field,
/// matching the protocol the JS engine expects (e.g. `{"type": "setValue", "path": "...", "value": ...}`).
public enum EngineCommand: Encodable, Sendable {
    /// Initialize the engine with a full rendering bundle.
    case initialize(RenderingBundle)
    /// Set a field value at the given path. Pass `nil` to clear the field.
    case setValue(path: String, value: JSONValue?)
    /// Change the active locale.
    case setLocale(languageCode: String)
    /// Replace the entire form response.
    case setResponse(JSONValue)
    /// Mark a field as touched (triggers validation display).
    case touchField(path: String)
    /// Add a new repeat instance to the named group.
    case addRepeatInstance(groupName: String)
    /// Remove the repeat instance at the given index from the named group.
    case removeRepeatInstance(groupName: String, index: Int)
    /// Request the current form response.
    case getResponse
    /// Request a validation report for the given profile (`"live"`, `"on-submit"`, `"on-demand"`, or `"off"`).
    case getValidationReport(profile: String)

    // MARK: - Encodable

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: DynamicCodingKey.self)
        switch self {
        case .initialize(let bundle):
            try container.encode("initialize", forKey: .key("type"))
            // Inline all bundle fields alongside the type discriminator.
            let bundleEncoder = DictionaryEncoder()
            let bundleDict = try bundleEncoder.encode(bundle)
            for (key, value) in bundleDict {
                try container.encode(value, forKey: .key(key))
            }

        case .setValue(let path, let value):
            try container.encode("setValue", forKey: .key("type"))
            try container.encode(path, forKey: .key("path"))
            if let v = value {
                try container.encode(v, forKey: .key("value"))
            } else {
                try container.encodeNil(forKey: .key("value"))
            }

        case .setLocale(let languageCode):
            try container.encode("setLocale", forKey: .key("type"))
            try container.encode(languageCode, forKey: .key("languageCode"))

        case .setResponse(let response):
            try container.encode("setResponse", forKey: .key("type"))
            try container.encode(response, forKey: .key("response"))

        case .touchField(let path):
            try container.encode("touchField", forKey: .key("type"))
            try container.encode(path, forKey: .key("path"))

        case .addRepeatInstance(let groupName):
            try container.encode("addRepeatInstance", forKey: .key("type"))
            try container.encode(groupName, forKey: .key("groupName"))

        case .removeRepeatInstance(let groupName, let index):
            try container.encode("removeRepeatInstance", forKey: .key("type"))
            try container.encode(groupName, forKey: .key("groupName"))
            try container.encode(index, forKey: .key("index"))

        case .getResponse:
            try container.encode("getResponse", forKey: .key("type"))

        case .getValidationReport(let profile):
            try container.encode("getValidationReport", forKey: .key("type"))
            try container.encode(profile, forKey: .key("profile"))
        }
    }
}

// MARK: - DynamicCodingKey

/// A `CodingKey` that accepts any string, used to build flat JSON objects from enums.
struct DynamicCodingKey: CodingKey {
    let stringValue: String
    var intValue: Int? { nil }

    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }

    static func key(_ string: String) -> DynamicCodingKey {
        DynamicCodingKey(stringValue: string)!
    }
}

// MARK: - DictionaryEncoder (private helper for initialize)

/// Encodes a `Codable` value into a `[String: JSONValue]` dictionary so its
/// keys can be inlined alongside the `type` discriminator.
private struct DictionaryEncoder {
    func encode<T: Encodable>(_ value: T) throws -> [String: JSONValue] {
        let data = try JSONEncoder().encode(value)
        let raw = try JSONSerialization.jsonObject(with: data)
        guard let dict = raw as? [String: Any] else {
            throw EncodingError.invalidValue(
                value,
                .init(codingPath: [], debugDescription: "DictionaryEncoder: encoded value is not a JSON object")
            )
        }
        // Re-encode each value back through JSONValue for type safety.
        let jsonData = try JSONSerialization.data(withJSONObject: dict)
        let jsonValue = try JSONDecoder().decode(JSONValue.self, from: jsonData)
        guard case .object(let result) = jsonValue else {
            throw EncodingError.invalidValue(
                value,
                .init(codingPath: [], debugDescription: "DictionaryEncoder: unexpected non-object")
            )
        }
        return result
    }
}
