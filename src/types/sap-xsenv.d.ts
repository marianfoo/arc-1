declare module '@sap/xsenv' {
  export function getServices(
    query: Record<string, { tag?: string; label?: string; name?: string }>,
  ): Record<string, Record<string, unknown>>;

  export function loadEnv(appFile?: string): void;
}
