/** Single entry point for data access; picks mock or real per config. */

import { USE_MOCK } from "./config";
import { httpApi } from "./httpApi";
import { mockApi } from "./mockApi";
import type { CoreApi } from "./types";

export const api: CoreApi = USE_MOCK ? mockApi : httpApi;

export * from "./types";
