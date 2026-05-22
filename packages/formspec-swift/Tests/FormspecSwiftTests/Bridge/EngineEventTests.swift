import XCTest
@testable import FormspecSwift

final class EngineEventTests: XCTestCase {

    private let decoder = JSONDecoder()

    private func decode(_ jsonString: String) throws -> EngineEvent {
        let data = jsonString.data(using: .utf8)!
        return try decoder.decode(EngineEvent.self, from: data)
    }

    // MARK: - engineReady

    func testDecodeEngineReady() throws {
        let event = try decode(#"{"type": "engineReady"}"#)
        if case .engineReady = event {
            // pass
        } else {
            XCTFail("Expected .engineReady, got \(event)")
        }
    }

    // MARK: - engineError

    func testDecodeEngineError() throws {
        let event = try decode(#"{"type": "engineError", "message": "something went wrong"}"#)
        if case .engineError(let message) = event {
            XCTAssertEqual(message, "something went wrong")
        } else {
            XCTFail("Expected .engineError, got \(event)")
        }
    }

    // MARK: - fieldStateChanged

    func testDecodeFieldStateChangedMinimal() throws {
        let json = #"""
        {
            "type": "fieldStateChanged",
            "path": "name",
            "changes": {}
        }
        """#
        let event = try decode(json)
        if case .fieldStateChanged(let path, let changes) = event {
            XCTAssertEqual(path, "name")
            XCTAssertNil(changes.value)
            XCTAssertNil(changes.label)
            XCTAssertNil(changes.required)
            XCTAssertNil(changes.visible)
        } else {
            XCTFail("Expected .fieldStateChanged, got \(event)")
        }
    }

    func testDecodeFieldStateChangedFull() throws {
        let json = #"""
        {
            "type": "fieldStateChanged",
            "path": "email",
            "changes": {
                "label": "Email Address",
                "hint": "Enter your email",
                "description": "We will not share your email",
                "value": "alice@example.com",
                "required": true,
                "visible": true,
                "readonly": false,
                "errors": [],
                "firstError": null,
                "optionsLoading": false
            }
        }
        """#
        let event = try decode(json)
        if case .fieldStateChanged(let path, let changes) = event {
            XCTAssertEqual(path, "email")
            XCTAssertEqual(changes.label, "Email Address")
            XCTAssertEqual(changes.hint, "Enter your email")
            XCTAssertEqual(changes.description, "We will not share your email")
            XCTAssertEqual(changes.value, .string("alice@example.com"))
            XCTAssertEqual(changes.required, true)
            XCTAssertEqual(changes.visible, true)
            XCTAssertEqual(changes.readonly, false)
            XCTAssertEqual(changes.errors, [])
            XCTAssertNil(changes.firstError)
            XCTAssertEqual(changes.optionsLoading, false)
        } else {
            XCTFail("Expected .fieldStateChanged, got \(event)")
        }
    }

    func testDecodeFieldStateChangedWithTouchedIgnored() throws {
        // JS side may send a "touched" field — it should be ignored harmlessly
        let json = #"""
        {
            "type": "fieldStateChanged",
            "path": "name",
            "changes": {
                "touched": false,
                "value": "Bob"
            }
        }
        """#
        let event = try decode(json)
        if case .fieldStateChanged(let path, let changes) = event {
            XCTAssertEqual(path, "name")
            XCTAssertEqual(changes.value, .string("Bob"))
            // touched is not in FieldStatePatch — it's silently ignored
        } else {
            XCTFail("Expected .fieldStateChanged, got \(event)")
        }
    }

    func testDecodeFieldStateChangedWithErrors() throws {
        let json = #"""
        {
            "type": "fieldStateChanged",
            "path": "age",
            "changes": {
                "errors": [
                    {
                        "path": "age",
                        "message": "Must be at least 18",
                        "severity": "error",
                        "constraintKind": "constraint",
                        "code": null
                    }
                ],
                "firstError": "Must be at least 18"
            }
        }
        """#
        let event = try decode(json)
        if case .fieldStateChanged(_, let changes) = event {
            XCTAssertEqual(changes.errors?.count, 1)
            XCTAssertEqual(changes.errors?.first?.message, "Must be at least 18")
            XCTAssertEqual(changes.errors?.first?.severity, .error)
            XCTAssertEqual(changes.firstError, "Must be at least 18")
        } else {
            XCTFail("Expected .fieldStateChanged, got \(event)")
        }
    }

    func testDecodeFieldStateChangedWithOptions() throws {
        let json = #"""
        {
            "type": "fieldStateChanged",
            "path": "color",
            "changes": {
                "options": [
                    {"value": "red", "label": "Red"},
                    {"value": "blue", "label": "Blue"}
                ]
            }
        }
        """#
        let event = try decode(json)
        if case .fieldStateChanged(_, let changes) = event {
            XCTAssertEqual(changes.options?.count, 2)
            XCTAssertEqual(changes.options?.first?.label, "Red")
            XCTAssertEqual(changes.options?.first?.value, .string("red"))
        } else {
            XCTFail("Expected .fieldStateChanged, got \(event)")
        }
    }

    // MARK: - formStateChanged

    func testDecodeFormStateChangedMinimal() throws {
        let json = #"""
        {
            "type": "formStateChanged",
            "changes": {}
        }
        """#
        let event = try decode(json)
        if case .formStateChanged(let changes) = event {
            XCTAssertNil(changes.title)
            XCTAssertNil(changes.isValid)
        } else {
            XCTFail("Expected .formStateChanged, got \(event)")
        }
    }

    func testDecodeFormStateChangedFull() throws {
        let json = #"""
        {
            "type": "formStateChanged",
            "changes": {
                "title": "My Form",
                "description": "A test form",
                "isValid": false,
                "errors": 2,
                "warnings": 1,
                "infos": 0
            }
        }
        """#
        let event = try decode(json)
        if case .formStateChanged(let changes) = event {
            XCTAssertEqual(changes.title, "My Form")
            XCTAssertEqual(changes.description, "A test form")
            XCTAssertEqual(changes.isValid, false)
            XCTAssertEqual(changes.errors, 2)
            XCTAssertEqual(changes.warnings, 1)
            XCTAssertEqual(changes.infos, 0)
        } else {
            XCTFail("Expected .formStateChanged, got \(event)")
        }
    }

    // MARK: - pageStateChanged

    func testDecodePageStateChanged() throws {
        let json = #"""
        {
            "type": "pageStateChanged",
            "pageId": "page-1",
            "title": "Step 1",
            "description": "Fill in your details"
        }
        """#
        let event = try decode(json)
        if case .pageStateChanged(let pageId, let title, let description) = event {
            XCTAssertEqual(pageId, "page-1")
            XCTAssertEqual(title, "Step 1")
            XCTAssertEqual(description, "Fill in your details")
        } else {
            XCTFail("Expected .pageStateChanged, got \(event)")
        }
    }

    // MARK: - repeatChanged

    func testDecodeRepeatChanged() throws {
        let json = #"""
        {
            "type": "repeatChanged",
            "groupName": "contacts",
            "count": 3
        }
        """#
        let event = try decode(json)
        if case .repeatChanged(let groupName, let count) = event {
            XCTAssertEqual(groupName, "contacts")
            XCTAssertEqual(count, 3)
        } else {
            XCTFail("Expected .repeatChanged, got \(event)")
        }
    }

    // MARK: - responseResult

    func testDecodeResponseResult() throws {
        let json = #"""
        {
            "type": "responseResult",
            "response": {"name": "Alice", "age": 30}
        }
        """#
        let event = try decode(json)
        if case .responseResult(let value) = event {
            if case .object(let dict) = value {
                XCTAssertEqual(dict["name"], .string("Alice"))
                XCTAssertEqual(dict["age"], .number(30))
            } else {
                XCTFail("Expected object JSONValue")
            }
        } else {
            XCTFail("Expected .responseResult, got \(event)")
        }
    }

    // MARK: - validationReportResult

    func testDecodeValidationReportResult() throws {
        let json = #"""
        {
            "type": "validationReportResult",
            "report": {
                "results": [
                    {
                        "path": "email",
                        "message": "Required field",
                        "severity": "error",
                        "constraintKind": "required",
                        "code": null
                    }
                ],
                "valid": false
            }
        }
        """#
        let event = try decode(json)
        if case .validationReportResult(let report) = event {
            let report = try XCTUnwrap(report)
            XCTAssertFalse(report.isValid)
            XCTAssertEqual(report.results.count, 1)
            XCTAssertEqual(report.results[0].path, "email")
            XCTAssertEqual(report.results[0].message, "Required field")
            XCTAssertEqual(report.results[0].severity, .error)
            XCTAssertEqual(report.results[0].constraintKind, "required")
        } else {
            XCTFail("Expected .validationReportResult, got \(event)")
        }
    }

    func testDecodeNullValidationReportResult() throws {
        let json = #"""
        {
            "type": "validationReportResult",
            "report": null
        }
        """#
        let event = try decode(json)
        if case .validationReportResult(let report) = event {
            XCTAssertNil(report)
        } else {
            XCTFail("Expected .validationReportResult, got \(event)")
        }
    }

    // MARK: - Unknown type

    func testDecodeUnknownTypeThrows() throws {
        let json = #"{"type": "unknownEventType"}"#
        XCTAssertThrowsError(try decode(json)) { error in
            // Should throw a decoding error
            XCTAssertTrue(error is DecodingError, "Expected DecodingError, got \(error)")
        }
    }

    // MARK: - Batch decode

    func testBatchDecodeVariousEvents() throws {
        let events: [(String, String)] = [
            ("engineReady", #"{"type": "engineReady"}"#),
            ("engineError", #"{"type": "engineError", "message": "oops"}"#),
            ("repeatChanged", #"{"type": "repeatChanged", "groupName": "items", "count": 2}"#),
            ("formStateChanged", #"{"type": "formStateChanged", "changes": {"isValid": true}}"#),
        ]
        for (name, json) in events {
            let event = try decode(json)
            // Just verify they decode without throwing
            XCTAssertNotNil(event, "Event \(name) failed to decode")
        }
    }
}
