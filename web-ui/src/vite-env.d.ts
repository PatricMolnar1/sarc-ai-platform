/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: string;
  readonly VITE_CORE_API_BASE?: string;
  readonly VITE_AI_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
