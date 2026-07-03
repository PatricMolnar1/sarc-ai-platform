/**
 * Runtime API configuration.
 *
 * The UI can run against an in-memory mock or the Spring Boot Core Backend. It
 * defaults to the mock; set VITE_USE_MOCK=false (and provide VITE_CORE_API_BASE)
 * to talk to the real service.
 */

const flag = import.meta.env.VITE_USE_MOCK;

/** Mock is the default; only an explicit "false" opts into the real backend. */
export const USE_MOCK = flag === undefined ? true : flag !== "false";

/** Base URL for the Core Backend. "/core" routes through the Vite dev proxy. */
export const CORE_API_BASE = import.meta.env.VITE_CORE_API_BASE ?? "/core";

/**
 * Base URL for the AI Worker (port 8000). "/ai" routes through the Vite dev
 * proxy for both HTTP and the pipeline WebSocket. Unlike the Core Backend, the
 * AI Worker has no mock; the pipeline flow always hits the real service.
 */
export const AI_API_BASE = import.meta.env.VITE_AI_API_BASE ?? "/ai";
