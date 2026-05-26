/** @filedesc Shared Playwright E2E harness port and health path (avoid 8080 — common SSH tunnel). */
export const FORMSPEC_E2E_PORT = 18765;
export const FORMSPEC_E2E_HEALTH_PATH = '/__formspec-e2e-health';
export const FORMSPEC_E2E_ORIGIN = `http://127.0.0.1:${FORMSPEC_E2E_PORT}`;
