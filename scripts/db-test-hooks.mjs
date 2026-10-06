// Module resolution for running src/ TypeScript under plain Node (used by the DB tests):
// maps the "@/..." alias to src/, resolves extensionless imports to .ts files, and stubs
// Next.js's "server-only" marker package.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
const candidates = (base) => [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base];

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export {};", shortCircuit: true };
  }

  let base = null;
  if (specifier.startsWith("@/")) {
    base = srcDir + specifier.slice(2);
  } else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    base = fileURLToPath(new URL(specifier, context.parentURL));
  }

  if (base) {
    const match = candidates(base).find((path) => existsSync(path) && !path.endsWith("/"));
    if (match) {
      return { url: pathToFileURL(match).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}
