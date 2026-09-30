/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
/** True in development and test builds; false in release builds. */
declare const __ALLOW_PLACEHOLDERS__: boolean;

interface ImportMetaEnv {
  /** Anonymous telemetry endpoint. Empty = telemetry disabled and its toggle hidden (spec 8.2). */
  readonly VITE_TELEMETRY_URL?: string;
  /** WhatsApp parents group link. Empty = the "Join Parents Group" link is hidden. */
  readonly VITE_PARENTS_GROUP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
