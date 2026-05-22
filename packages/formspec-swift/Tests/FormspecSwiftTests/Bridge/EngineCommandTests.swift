import XCTest
@testable import FormspecSwift

final class EngineCommandTests: XCTestCase {

    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    // MARK: - Helper

    /// Encode a command to a JSON dictionary for assertion.
    private func encodeToDict(_ command: EngineCommand) throws -> [String: Any] {
        let data = try encoder.encode(command)
        let obj = try JSONSerialization.jsonObject(with: data)
        guard let dict = obj as? [String: Any] else {
            XCTFail("Encoded command is not a JSON object")
            throw EncodingError.invalidValue(command, .init(codingPath: [], debugDescription: "Not an object"))
        }
        return dict
    }

    // MARK: - setValue

    func testEncodeSetValueString() throws {
        let cmd = EngineCommand.setValue(path: "name", value: .string("Alice"))
        let dict = try encodeToDict(cmd)
        XCTAssertEqual(dict["type"] as? String, "setValue")
        XCTAssertEqual(dict["path"] as? String, "name")
        XCTAssertEqual(dict["value"] as? String, "Alice")
    }

    func testEncodeSetValueNumber() throws {
        let cmd = EngineCommand.setValue(path: "age", value: .number(30))
        let dict = try encodeToDict(cmd)
        XCTAssertEqual(dict["type"] as? String, "setValue")
        XCTAssertEqual(dict["path"] as? String, "age")
        XCTAssertEqual(dict["value"] as? Double, 30)
    }

    func testEncodeSetValueBool() throws {
        let cmd = EngineCommand.setValue(path: "active", value: .bool(true))
        let dict = try encodeToDict(cmd)
        XCTAssertEqual(dict["type"] as? String, "setValue")
        XCTAssertEqual(dict["path"] as? String, "active")
        XCTAssertEqual(dict["value"] as? Bool, true)
    }

    func testEncodeSetValueNull() throws {
        let cmd = EngineCommand.setValue(path: "field", value: nil)
        let dict = try encodeToDict(cmd)
        XCTAssertEqual(dict["type"] as? String, "setValue")
        XCTAssertEqual(dict["path"] as? String, "field")
        // value key should be present and null
        XCTAssertTrue(dict.keys.contains("value"))
        XCTAssertTrue(dict["value"] is NSNull)
    }

    func testEncodeSetValueNullJSONValue() throws {
        let cmd = EngineCommand.setValue(path: "field", value: .null)
        let dict = try encodeToDict(cmd)
        XCTAssertEqual(dict["type"] as? String, "setValue")
        XCTAssertTrue(dict["value"] is NSNull)
    }

    // MARK: - setLocale

    func testEncodeSetLocale() throws {
        let cmd = EngineCommand.setLocale(languageCode: "en-US")
        let dict = try encodeToDict(cmd)
        XCTAssertEqual(dict["type"] as? String, "setLocale")
        XCTAssertEqual(dict["languageCode"] as? String, "en-US")
        // must be flat — no nested enum payload
        XCTAssertNil(dict["setLocale"])
    }

    // MARK: - touchField

    func testEncodeTouchField() throws {
        let cmd = EngineCommand.touchField(path: "email")
        let dict = try encodeToDict(cmd)
        XCTAssertEqual(dict["type"] as? String, "touchField")
        XCTAssertEqual(dict["path"] as? String, "email")
    }

    // MARK: - addRepeatInstance

    func testEncodeAddRepeatInstance() throws {
        let cmd = EngineCommand.addRepeatInstance(groupName: "contacts")
        let dict = try encodeToDict(cmd)
        XCTAssertEqual(dict["type"] as? String, "addRepeatInstance")
        XCTAssertEqual(dict["groupName"] as? String, "contacts")
    }

    // MARK: - removeRepeatInstance

    func testEncodeRemoveRepeatInstance() throws {
        let cmd = EngineCommand.removeRepeatInstance(groupName: "contacts", index: 2)
        let dict = try encodeToDict(cmd)
        XCTAssertEqual(dict["type"] as? String, "removeRepeatInstance")
        XCTAssertEqual(dict["groupName"] as? String, "contacts")
        XCTAssertEqual(dict["index"] as? Int, 2)
    }

    // MARK: - getResponse

    func testEncodeGetResponse() throws {
        let cmd = EngineCommand.getResponse
        let dict = try encodeToDict(cmd)
        XCTAssertEqual(dict["type"] as? String, "getResponse")
        // Must be flat — only type key
        XCTAssertEqual(dict.keys.count, 1)
    }

    // MARK: - getValidationReport

    func testEncodeGetValidationReport() throws {
        let cmd = EngineCommand.getValidationReport(profile: "on-submit")
        let dict = try encodeToDict(cmd)
        XCTAssertEqual(dict["type"] as? String, "getValidationReport")
        XCTAssertEqual(dict["profile"] as? String, "on-submit")
    }

    func testEncodeGetValidationReportLive() throws {
        let cmd = EngineCommand.getValidationReport(profile: "live")
        let dict = try encodeToDict(cmd)
        XCTAssertEqual(dict["type"] as? String, "getValidationReport")
        XCTAssertEqual(dict["profile"] as? String, "live")
    }

    // MARK: - setResponse

    func testEncodeSetResponse() throws {
        let response = JSONValue.object(["field1": .string("hello"), "field2": .number(42)])
        let cmd = EngineCommand.setResponse(response)
        let dict = try encodeToDict(cmd)
        XCTAssertEqual(dict["type"] as? String, "setResponse")
        // response payload should be present
        let responseDict = dict["response"] as? [String: Any]
        XCTAssertNotNil(responseDict)
        XCTAssertEqual(responseDict?["field1"] as? String, "hello")
    }

    // MARK: - initialize

    func testEncodeInitialize() throws {
        let bundle = RenderingBundle(
            definition: .object(["formId": .string("test-form")]),
            layoutPlan: .object(["root": .string("container")])
        )
        let cmd = EngineCommand.initialize(bundle)
        let dict = try encodeToDict(cmd)
        XCTAssertEqual(dict["type"] as? String, "initialize")
        // bundle fields should be flat at top level (or nested under "bundle"?)
        // The spec says flat JSON — but initialize carries a RenderingBundle.
        // We inline the bundle fields alongside the type discriminator.
        let definition = dict["definition"] as? [String: Any]
        XCTAssertNotNil(definition)
        XCTAssertEqual(definition?["formId"] as? String, "test-form")
    }

    // MARK: - Flat encoding verification

    func testAllCommandsProduceObjects() throws {
        let commands: [EngineCommand] = [
            .setValue(path: "x", value: .string("v")),
            .setLocale(languageCode: "fr"),
            .touchField(path: "y"),
            .addRepeatInstance(groupName: "g"),
            .removeRepeatInstance(groupName: "g", index: 0),
            .getResponse,
            .getValidationReport(profile: "on-submit"),
        ]
        for cmd in commands {
            let data = try encoder.encode(cmd)
            let obj = try JSONSerialization.jsonObject(with: data)
            XCTAssertTrue(obj is [String: Any], "Command \(cmd) did not encode to a JSON object")
        }
    }

    func testAllCommandsHaveTypeField() throws {
        let commands: [EngineCommand] = [
            .setValue(path: "x", value: .string("v")),
            .setLocale(languageCode: "fr"),
            .touchField(path: "y"),
            .addRepeatInstance(groupName: "g"),
            .removeRepeatInstance(groupName: "g", index: 0),
            .getResponse,
            .getValidationReport(profile: "on-submit"),
        ]
        for cmd in commands {
            let dict = try encodeToDict(cmd)
            XCTAssertNotNil(dict["type"], "Command \(cmd) missing 'type' field")
            XCTAssertFalse((dict["type"] as? String ?? "").isEmpty, "Command \(cmd) has empty 'type'")
        }
    }
}
