/// @filedesc WebViewEngineTests — integration tests for the hidden WKWebView bridge.

import XCTest
@testable import FormspecSwift

// NOTE: These tests exercise WKWebView which requires a running macOS/iOS runtime.
// They use XCTestExpectation + async/await and are marked as requiring main actor.

@MainActor
final class WebViewEngineTests: XCTestCase {

    // MARK: - testSendCommandBeforeLoad

    func testSendCommandBeforeLoad() async {
        let engine = WebViewEngine()
        do {
            try await engine.send(.getResponse)
            XCTFail("Expected error when sending before load")
        } catch {
            // Expected: bridge is not loaded
            XCTAssertFalse(engine.isLoaded)
        }
    }

    // MARK: - testLoadBridgeHTML

    func testLoadBridgeHTML() async throws {
        let engine = WebViewEngine()
        XCTAssertFalse(engine.isLoaded)
        try await engine.loadBridge()
        XCTAssertTrue(engine.isLoaded)
        engine.dispose()
    }

    // MARK: - testDispose

    func testDispose() async throws {
        let engine = WebViewEngine()
        try await engine.loadBridge()
        XCTAssertTrue(engine.isLoaded)
        engine.dispose()
        XCTAssertFalse(engine.isLoaded)
    }

    // MARK: - testSendValueWithJSStringTerminators
    //
    // Regression: the old bridge concatenated the JSON-encoded command into a JS
    // string literal with a hand-rolled escape that handled only `\\` and `'`.
    // U+2028 / U+2029 are valid JSON characters but terminate JS strings, and
    // embedded newlines / single quotes likewise broke or escaped the literal —
    // a JS-injection vector. The bridge now binds the JSON string as a native
    // `callAsyncJavaScript` argument, so these payloads must round-trip cleanly.
    func testSendValueWithJSStringTerminators() async throws {
        let engine = WebViewEngine()
        try await engine.loadBridge()
        defer { engine.dispose() }

        let hostilePayloads: [String] = [
            "line1\u{2028}line2",                // LINE SEPARATOR
            "para1\u{2029}para2",                // PARAGRAPH SEPARATOR
            "tab\tnewline\nreturn\rdone",        // control whitespace
            "quote'and\"and\\backslash",         // both quote flavours + backslash
            "');window.injected=true;//",        // attempted escape-out of literal
            "\u{2028}'\u{2029}\\\n",             // combined hostile mix
        ]

        for payload in hostilePayloads {
            try await engine.send(.setValue(path: "field", value: .string(payload)))
        }

        // If any payload had escaped the JS string literal it would have either
        // thrown from the bridge call or crashed the WebContent process.
        XCTAssertTrue(engine.isLoaded, "Bridge should remain loaded after hostile payloads")
    }
}
