/// @filedesc FormspecEngine — main public API: initializes the JS engine, manages form state, and processes events.

import Foundation
import Observation
import os

// MARK: - FormspecEngine

/// The main public API for formspec in Swift.
///
/// Manages a `WebViewEngine` bridge to the JS formspec engine, exposes reactive
/// `FormState` and per-field `FieldState` objects, and handles all bridge events.
///
/// **Usage:**
/// ```swift
/// let engine = try await FormspecEngine.create(bundle: myBundle)
/// let nameState = engine.fieldState(for: "name")
/// ```
@MainActor @Observable
public final class FormspecEngine {

    // MARK: - Logging

    /// Subsystem logger for FormspecEngine runtime diagnostics.
    public static let logger = Logger(subsystem: "org.formspec.FormspecSwift", category: "Engine")

    // MARK: - Public observable state

    /// Reactive form-level state (title, validation summary, page metadata).
    public let formState: FormState

    /// The root layout node decoded from the bundle's `layoutPlan`.
    public let rootLayoutNode: LayoutNode

    /// The currently active locale code (e.g. `"en"`, `"fr"`).
    public private(set) var currentLocale: String = "en"

    /// All locales declared in the bundle.
    public private(set) var availableLocales: [String] = []

    /// The most recent error encountered by the engine or bridge mutators, if any.
    public private(set) var lastError: FormspecError?

    /// Clear the current `lastError`.
    public func clearLastError() {
        lastError = nil
    }

    // MARK: - Private state

    /// Flag indicating whether the engine has been disposed.
    private var isDisposed = false

    /// Cache of per-field state objects, keyed by instance path.
    private var fieldStateCache: [String: FieldState] = [:]

    /// The underlying WKWebView bridge. `nil` in test instances created via the internal init.
    private var bridge: WebViewEngine?

    /// The rendering bundle used to initialize the engine.
    private var bundle: RenderingBundle?

    /// Continuation for a pending `getResponse` call.
    private var pendingResponseContinuation: CheckedContinuation<JSONValue, Never>?

    /// Continuation for a pending `getValidationReport` call.
    private var pendingReportContinuation: CheckedContinuation<ValidationReport?, Never>?

    // MARK: - Internal init (for testing — no WebView)

    /// Creates an engine with a pre-built `LayoutNode`, bypassing the bridge.
    ///
    /// Intended for unit tests only. The bridge is `nil`; mutations that fire
    /// async bridge commands will silently drop them.
    init(rootLayoutNode: LayoutNode) {
        self.rootLayoutNode = rootLayoutNode
        self.formState = FormState()
    }

    // MARK: - Public factory

    /// Create a `FormspecEngine` from a `RenderingBundle`.
    ///
    /// - Decodes the `layoutPlan` from the bundle into a `LayoutNode` tree.
    /// - Creates a hidden `WKWebView` bridge and loads the formspec engine HTML.
    /// - Sends the `initialize` command and waits for `engineReady` (10 s timeout).
    ///
    /// Throws if the `layoutPlan` is missing or malformed, the HTML resource is
    /// missing, or the engine times out during initialization.
    public static func create(bundle: RenderingBundle) async throws -> FormspecEngine {
        // 1. Decode layoutPlan → LayoutNode
        let layoutNode = try decodeLayoutNode(from: bundle.layoutPlan)

        // 2. Create engine instance (no bridge yet)
        let engine = FormspecEngine(rootLayoutNode: layoutNode)
        engine.bundle = bundle

        // Populate available locales from bundle
        if let locales = bundle.locales {
            engine.availableLocales = Array(locales.keys)
        }
        if let defaultLocale = bundle.defaultLocale {
            engine.currentLocale = defaultLocale
        }

        // 3. Set up bridge
        let bridge = WebViewEngine()
        engine.bridge = bridge

        bridge.onEvents { [weak engine] events in
            engine?.processEvents(events)
        }

        // 4. Load bridge HTML
        try await bridge.loadBridge()

        // 5. Send initialize command and wait for engineReady
        try await withThrowingTaskGroup(of: Void.self) { group in
            // Timeout task
            group.addTask {
                try await Task.sleep(nanoseconds: 10_000_000_000) // 10 seconds
                throw FormspecEngineError.initializationTimeout
            }

            // Wait for engineReady event
            group.addTask {
                await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                    Task { @MainActor in
                        engine.waitForReady(continuation: cont)
                    }
                }
            }

            // Send initialize command (after setting up the ready waiter)
            try await bridge.send(.initialize(bundle))

            // Wait for whichever task finishes first
            try await group.next()
            group.cancelAll()
        }

        return engine
    }

    // MARK: - Field state lookup

    /// Returns the reactive `FieldState` for the given instance path, or `nil` if unknown.
    public func fieldState(for path: String) -> FieldState? {
        fieldStateCache[path]
    }

    // MARK: - Bridge command dispatching

    /// Dispatch a command to the bridge asynchronously, capturing any thrown errors into `lastError`.
    private func sendCommand(_ command: EngineCommand) {
        guard !isDisposed else {
            let error = FormspecError.bridgeDisconnected
            Self.logger.error("Bridge command dropped: bridge is disposed")
            self.lastError = error
            return
        }
        guard let bridge else {
            // Test instances initialized without bridge silently return
            return
        }
        Task { [weak self] in
            do {
                try await bridge.send(command)
            } catch WebViewEngineError.notLoaded {
                let err = FormspecError.bridgeDisconnected
                Self.logger.error("Bridge command failed: bridge not loaded")
                self?.lastError = err
            } catch let error as FormspecError {
                Self.logger.error("Bridge command failed: \(error.localizedDescription, privacy: .public)")
                self?.lastError = error
            } catch {
                let err = FormspecError.engineLoadFailed(message: error.localizedDescription)
                Self.logger.error("Bridge command failed: \(error.localizedDescription, privacy: .public)")
                self?.lastError = err
            }
        }
    }

    /// Dispatch a command to the bridge asynchronously, throwing errors and recording in `lastError`.
    private func sendCommandThrowing(_ command: EngineCommand) async throws {
        guard !isDisposed else {
            let error = FormspecError.bridgeDisconnected
            Self.logger.error("Bridge command dropped: bridge is disposed")
            self.lastError = error
            throw error
        }
        guard let bridge else {
            return
        }
        do {
            try await bridge.send(command)
        } catch WebViewEngineError.notLoaded {
            let err = FormspecError.bridgeDisconnected
            Self.logger.error("Bridge command failed: bridge not loaded")
            self.lastError = err
            throw err
        } catch let error as FormspecError {
            Self.logger.error("Bridge command failed: \(error.localizedDescription, privacy: .public)")
            self.lastError = error
            throw error
        } catch {
            let err = FormspecError.engineLoadFailed(message: error.localizedDescription)
            Self.logger.error("Bridge command failed: \(error.localizedDescription, privacy: .public)")
            self.lastError = err
            throw err
        }
    }

    // MARK: - Mutations

    /// Set a field's value, forwarding to the JS engine and recording any error in `lastError`.
    public func setValue(_ path: String, value: Any?) {
        let jsonValue = anyToJSONValue(value)
        sendCommand(.setValue(path: path, value: jsonValue))
    }

    /// Set a field's value, throwing on bridge failure.
    public func setValueAsync(_ path: String, value: Any?) async throws {
        let jsonValue = anyToJSONValue(value)
        try await sendCommandThrowing(.setValue(path: path, value: jsonValue))
    }

    /// Change the active locale, forwarding to the JS engine and recording any error in `lastError`.
    public func setLocale(_ languageCode: String) {
        currentLocale = languageCode
        sendCommand(.setLocale(languageCode: languageCode))
    }

    /// Change the active locale, throwing on bridge failure.
    public func setLocaleAsync(_ languageCode: String) async throws {
        currentLocale = languageCode
        try await sendCommandThrowing(.setLocale(languageCode: languageCode))
    }

    /// Replace the entire form response, forwarding to the JS engine and recording any error in `lastError`.
    public func setResponse(_ data: JSONValue) {
        sendCommand(.setResponse(data))
    }

    /// Replace the entire form response, throwing on bridge failure.
    public func setResponseAsync(_ data: JSONValue) async throws {
        try await sendCommandThrowing(.setResponse(data))
    }

    /// Add a new repeat instance to the named group.
    ///
    /// Returns `nil` immediately (actual count comes back as an event).
    @discardableResult
    public func addRepeatInstance(_ groupName: String) -> Int? {
        sendCommand(.addRepeatInstance(groupName: groupName))
        return nil
    }

    /// Add a new repeat instance to the named group, throwing on bridge failure.
    public func addRepeatInstanceAsync(_ groupName: String) async throws {
        try await sendCommandThrowing(.addRepeatInstance(groupName: groupName))
    }

    /// Remove the repeat instance at `index` from the named group.
    public func removeRepeatInstance(_ groupName: String, at index: Int) {
        sendCommand(.removeRepeatInstance(groupName: groupName, index: index))
    }

    /// Remove the repeat instance at `index` from the named group, throwing on bridge failure.
    public func removeRepeatInstanceAsync(_ groupName: String, at index: Int) async throws {
        try await sendCommandThrowing(.removeRepeatInstance(groupName: groupName, index: index))
    }

    // MARK: - Queries

    /// Request the current form response from the JS engine (async).
    public func getResponse() async -> JSONValue {
        await withCheckedContinuation { continuation in
            pendingResponseContinuation = continuation
            Task { try? await bridge?.send(.getResponse) }
        }
    }

    /// Request a validation report from the JS engine (async).
    public func getValidationReport(profile: ValidationProfile = .live) async -> ValidationReport? {
        return await withCheckedContinuation { continuation in
            pendingReportContinuation = continuation
            Task { try? await bridge?.send(.getValidationReport(profile: profile.rawValue)) }
        }
    }

    // MARK: - Lifecycle

    /// Tear down the WebView bridge and clear all state.
    public func dispose() {
        isDisposed = true
        bridge?.dispose()
        bridge = nil
        fieldStateCache.removeAll()
    }

    // MARK: - Internal event processing

    /// Process a batch of `EngineEvent` values received from the JS engine.
    func processEvents(_ events: [EngineEvent]) {
        for event in events {
            handleEvent(event)
        }
    }

    // MARK: - Private helpers

    private func handleEvent(_ event: EngineEvent) {
        switch event {
        case .fieldStateChanged(let path, let changes):
            let state = getOrCreateFieldState(path: path)
            state.apply(patch: changes)

        case .formStateChanged(let changes):
            formState.apply(patch: changes)

        case .pageStateChanged(let pageId, let title, let description):
            formState.setPageTitle(pageId, title: title)
            formState.setPageDescription(pageId, description: description)

        case .repeatChanged:
            // No-op: new field paths arrive as fieldStateChanged events.
            break

        case .responseResult(let data):
            pendingResponseContinuation?.resume(returning: data)
            pendingResponseContinuation = nil

        case .validationReportResult(let report):
            pendingReportContinuation?.resume(returning: report)
            pendingReportContinuation = nil

        case .engineReady:
            engineReadyContinuation?.resume()
            engineReadyContinuation = nil

        case .engineError(let message):
            Self.logger.error("Engine error: \(message, privacy: .public)")
            lastError = .engineLoadFailed(message: message)
        }
    }

    /// Continuation used during `create(bundle:)` to wait for `engineReady`.
    private var engineReadyContinuation: CheckedContinuation<Void, Never>?

    private func waitForReady(continuation: CheckedContinuation<Void, Never>) {
        engineReadyContinuation = continuation
    }

    /// Get an existing `FieldState` for `path`, or create and cache a new one.
    private func getOrCreateFieldState(path: String) -> FieldState {
        if let existing = fieldStateCache[path] {
            return existing
        }
        return createFieldState(path: path)
    }

    /// Create a new `FieldState` with default identity fields derived from `path`.
    @discardableResult
    private func createFieldState(path: String) -> FieldState {
        // Derive a simple itemKey from the last path component (strip array notation).
        let itemKey = path
            .split(separator: ".")
            .last
            .map { String($0).replacingOccurrences(of: #"\[\d+\]"#, with: "", options: .regularExpression) }
            ?? path

        let state = FieldState(
            templatePath: path,
            instancePath: path,
            id: "field-\(path)",
            itemKey: itemKey,
            dataType: "text",
            disabledDisplay: .hidden
        )
        state.delegate = self
        fieldStateCache[path] = state
        return state
    }

    /// Decode a `LayoutNode` from a `JSONValue`.
    private static func decodeLayoutNode(from jsonValue: JSONValue) throws -> LayoutNode {
        let data = try JSONEncoder().encode(jsonValue)
        return try JSONDecoder().decode(LayoutNode.self, from: data)
    }
}

// MARK: - FieldStateDelegate

extension FormspecEngine: FieldStateDelegate {
    public func fieldDidSetValue(_ path: String, value: Any?) {
        let jsonValue = anyToJSONValue(value)
        sendCommand(.setValue(path: path, value: jsonValue))
    }

    public func fieldDidTouch(_ path: String) {
        sendCommand(.touchField(path: path))
    }
}

// MARK: - FormspecEngineError

/// Errors thrown by `FormspecEngine.create(bundle:)`.
public enum FormspecEngineError: Error, LocalizedError {
    case malformedLayoutPlan(String)
    case initializationTimeout

    public var errorDescription: String? {
        switch self {
        case .malformedLayoutPlan(let msg):
            return "FormspecEngine: malformed layoutPlan — \(msg)"
        case .initializationTimeout:
            return "FormspecEngine: engine did not send engineReady within 10 seconds"
        }
    }
}

// MARK: - anyToJSONValue helper

/// Convert a native Swift value to a `JSONValue` for sending over the bridge.
private func anyToJSONValue(_ value: Any?) -> JSONValue? {
    guard let value else { return nil }
    switch value {
    case let s as String:  return .string(s)
    case let d as Double:  return .number(d)
    case let f as Float:   return .number(Double(f))
    case let i as Int:     return .number(Double(i))
    case let b as Bool:    return .bool(b)
    case let j as JSONValue: return j
    default: return nil
    }
}
