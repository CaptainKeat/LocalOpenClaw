export function resolveNodeRequireFromMeta(metaUrl: string): NodeJS.Require | null {
  // Guarded so this module can be imported from a browser bundle without
  // throwing at load time: `process` is undefined there.
  if (typeof process === "undefined") {
    return null;
  }
  const getBuiltinModule = (
    process as NodeJS.Process & {
      getBuiltinModule?: (id: string) => unknown;
    }
  ).getBuiltinModule;
  if (typeof getBuiltinModule !== "function") {
    return null;
  }
  try {
    const moduleNamespace = getBuiltinModule("module") as {
      createRequire?: (id: string) => NodeJS.Require;
    };
    const createRequire =
      typeof moduleNamespace.createRequire === "function" ? moduleNamespace.createRequire : null;
    return createRequire ? createRequire(metaUrl) : null;
  } catch {
    return null;
  }
}
