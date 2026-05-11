/**
 * Central gate for developer QA utilities. Never rely on this for security — server remains authoritative.
 */
export const DEV_TOOLS_ENABLED =
  typeof __DEV__ !== 'undefined' && __DEV__ === true
    ? true
    : String(process.env.EXPO_PUBLIC_DEV_TOOLS ?? '').toLowerCase() === 'true';

export function assertDevToolsEnabled(context: string): void {
  if (!DEV_TOOLS_ENABLED) {
    throw new Error(`[dev-tools] ${context}: dev tools are disabled`);
  }
}
