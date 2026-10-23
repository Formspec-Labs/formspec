/// @filedesc FormspecError — all errors thrown by the FormspecSwift public API.

import Foundation

/// Errors that can be thrown by the FormspecSwift library.
public enum FormspecError: Error, Sendable, Equatable, LocalizedError {
    /// The WASM bundle could not be loaded or initialized.
    case wasmLoadFailed(underlying: String)
    /// The formspec engine failed to start up.
    case engineLoadFailed(message: String)
    /// The provided form definition is structurally invalid.
    case definitionInvalid(message: String)
    /// The bridge to the embedded WebView is not connected.
    case bridgeDisconnected
    /// A bridge operation did not receive a response within the allowed time.
    case bridgeTimeout
    /// The requested locale is not available in the bundle.
    case localeNotAvailable(languageCode: String)

    public var errorDescription: String? {
        switch self {
        case .wasmLoadFailed(let underlying):
            return "WASM load failed: \(underlying)"
        case .engineLoadFailed(let message):
            return "Engine load failed: \(message)"
        case .definitionInvalid(let message):
            return "Form definition invalid: \(message)"
        case .bridgeDisconnected:
            return "Bridge disconnected"
        case .bridgeTimeout:
            return "Bridge operation timed out"
        case .localeNotAvailable(let languageCode):
            return "Locale not available: \(languageCode)"
        }
    }
}

