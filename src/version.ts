// Replaced at build time by Vite's `define` from package.json, so the
// User-Agent can never drift from the published version.
declare const __SUPDESK_VERSION__: string;

export const VERSION: string =
  typeof __SUPDESK_VERSION__ === 'string' ? __SUPDESK_VERSION__ : '0.0.0-dev';
