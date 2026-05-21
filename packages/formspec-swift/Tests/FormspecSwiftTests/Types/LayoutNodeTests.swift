import XCTest
@testable import FormspecSwift

final class LayoutNodeTests: XCTestCase {

    // MARK: - Helpers

    private func loadFixture(_ name: String) throws -> Data {
        let bundle = Bundle.module
        guard let url = bundle.url(forResource: "Fixtures/\(name)", withExtension: nil) else {
            throw XCTestError(.failureWhileWaiting, userInfo: [
                NSLocalizedDescriptionKey: "Fixture not found: \(name)"
            ])
        }
        return try Data(contentsOf: url)
    }

    // MARK: - LayoutNode decode from fixture

    func testDecodeRootNode() throws {
        let data = try loadFixture("simple-layout.json")
        let root = try JSONDecoder().decode(LayoutNode.self, from: data)

        XCTAssertEqual(root.id, "root")
        XCTAssertEqual(root.component, "Stack")
        XCTAssertEqual(root.category, .layout)
        XCTAssertEqual(root.props["direction"], .string("vertical"))
        XCTAssertEqual(root.cssClasses, ["form-root"])
        XCTAssertEqual(root.children.count, 2)
        XCTAssertNil(root.bindPath)
        XCTAssertNil(root.when)
    }

    func testDecodeFieldChild() throws {
        let data = try loadFixture("simple-layout.json")
        let root = try JSONDecoder().decode(LayoutNode.self, from: data)
        let fieldName = root.children[0]

        XCTAssertEqual(fieldName.id, "field-name")
        XCTAssertEqual(fieldName.component, "TextInput")
        XCTAssertEqual(fieldName.category, .field)
        XCTAssertEqual(fieldName.bindPath, "contactInfo.fullName")
        XCTAssertEqual(fieldName.labelPosition, .top)
    }

    func testDecodeFieldItem() throws {
        let data = try loadFixture("simple-layout.json")
        let root = try JSONDecoder().decode(LayoutNode.self, from: data)
        let fieldName = root.children[0]

        XCTAssertNotNil(fieldName.fieldItem)
        XCTAssertEqual(fieldName.fieldItem?.key, "fullName")
        XCTAssertEqual(fieldName.fieldItem?.label, "Full Name")
        XCTAssertEqual(fieldName.fieldItem?.hint, "Enter your full legal name")
        XCTAssertEqual(fieldName.fieldItem?.dataType, "string")
    }

    func testDecodePresentation() throws {
        let data = try loadFixture("simple-layout.json")
        let root = try JSONDecoder().decode(LayoutNode.self, from: data)
        let fieldName = root.children[0]

        XCTAssertNotNil(fieldName.presentation)
        XCTAssertEqual(fieldName.presentation?.widget, "Text")
        XCTAssertEqual(fieldName.presentation?.labelPosition, .top)
    }

    func testDecodeFieldWithWhen() throws {
        let data = try loadFixture("simple-layout.json")
        let root = try JSONDecoder().decode(LayoutNode.self, from: data)
        let fieldEmail = root.children[1]

        XCTAssertEqual(fieldEmail.id, "field-email")
        XCTAssertEqual(fieldEmail.bindPath, "contactInfo.email")
        XCTAssertEqual(fieldEmail.when, "$relevant")
        XCTAssertNil(fieldEmail.fieldItem)
        XCTAssertNil(fieldEmail.presentation)
        XCTAssertNil(fieldEmail.labelPosition)
    }

    // MARK: - NodeCategory raw values

    func testNodeCategoryRawValues() {
        XCTAssertEqual(NodeCategory.layout.rawValue, "layout")
        XCTAssertEqual(NodeCategory.field.rawValue, "field")
        XCTAssertEqual(NodeCategory.display.rawValue, "display")
        XCTAssertEqual(NodeCategory.interactive.rawValue, "interactive")
        XCTAssertEqual(NodeCategory.special.rawValue, "special")
    }

    // MARK: - LabelPosition raw values

    func testLabelPositionRawValues() {
        XCTAssertEqual(LabelPosition.top.rawValue, "top")
        XCTAssertEqual(LabelPosition.start.rawValue, "start")
        XCTAssertEqual(LabelPosition.hidden.rawValue, "hidden")
    }

    // MARK: - Optional fields default to nil/empty

    func testOptionalFieldsAbsentInRootNode() throws {
        let data = try loadFixture("simple-layout.json")
        let root = try JSONDecoder().decode(LayoutNode.self, from: data)

        XCTAssertNil(root.style)
        XCTAssertNil(root.accessibility)
        XCTAssertNil(root.bindPath)
        XCTAssertNil(root.fieldItem)
        XCTAssertNil(root.presentation)
        XCTAssertNil(root.labelPosition)
        XCTAssertNil(root.when)
        XCTAssertNil(root.whenPrefix)
        XCTAssertNil(root.fallback)
        XCTAssertNil(root.repeatGroup)
        XCTAssertNil(root.repeatPath)
        XCTAssertNil(root.isRepeatTemplate)
    }

    // MARK: - ResolvedOption

    func testResolvedOptionEquatable() {
        let opt1 = ResolvedOption(value: .string("yes"), label: "Yes")
        let opt2 = ResolvedOption(value: .string("yes"), label: "Yes")
        let opt3 = ResolvedOption(value: .string("no"), label: "No")
        XCTAssertEqual(opt1, opt2)
        XCTAssertNotEqual(opt1, opt3)
    }

    func testResolvedOptionRoundTrip() throws {
        let original = ResolvedOption(value: .number(1), label: "Option 1")
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(ResolvedOption.self, from: data)
        XCTAssertEqual(original, decoded)
    }

    // MARK: - ValidationTypes

    func testValidationSeverityRawValues() {
        XCTAssertEqual(ValidationSeverity.error.rawValue, "error")
        XCTAssertEqual(ValidationSeverity.warning.rawValue, "warning")
        XCTAssertEqual(ValidationSeverity.info.rawValue, "info")
    }

    func testValidationReportRoundTrip() throws {
        let report = ValidationReport(
            results: [
                ResolvedValidationResult(
                    path: "name",
                    message: "Required",
                    severity: .error,
                    constraintKind: "required",
                    code: "REQUIRED"
                )
            ],
            isValid: false
        )
        let data = try JSONEncoder().encode(report)
        let decoded = try JSONDecoder().decode(ValidationReport.self, from: data)
        XCTAssertEqual(decoded.isValid, false)
        XCTAssertEqual(decoded.results.count, 1)
        XCTAssertEqual(decoded.results[0].path, "name")
        XCTAssertEqual(decoded.results[0].severity, .error)
    }

    func testValidationResultEquatable() {
        let r1 = ResolvedValidationResult(path: "x", message: "err", severity: .error, constraintKind: nil, code: nil)
        let r2 = ResolvedValidationResult(path: "x", message: "err", severity: .error, constraintKind: nil, code: nil)
        XCTAssertEqual(r1, r2)
    }

    func testValidationSummaryEquatable() {
        let s1 = ValidationSummary(errors: 1, warnings: 0, infos: 2)
        let s2 = ValidationSummary(errors: 1, warnings: 0, infos: 2)
        XCTAssertEqual(s1, s2)
    }

    // MARK: - FormspecError

    func testFormspecErrorIsError() {
        let err: Error = FormspecError.bridgeDisconnected
        XCTAssertNotNil(err)
    }

    func testFormspecErrorCases() {
        let cases: [FormspecError] = [
            .wasmLoadFailed(underlying: "oops"),
            .engineLoadFailed(message: "bad"),
            .definitionInvalid(message: "invalid"),
            .bridgeDisconnected,
            .bridgeTimeout,
            .localeNotAvailable(languageCode: "fr")
        ]
        XCTAssertEqual(cases.count, 6)
    }
}
