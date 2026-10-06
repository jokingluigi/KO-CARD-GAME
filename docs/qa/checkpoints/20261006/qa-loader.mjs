// Checkpoint-only Windows QA helper. Run from the repository root with Node 24+.
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); } catch (error) {
      if (specifier.startsWith('.') || specifier.startsWith('@/')) {
        const base = specifier.startsWith('@/')
          ? path.resolve('artifacts/ko-game/src', specifier.slice(2))
          : fileURLToPath(new URL(specifier, context.parentURL));
        for (const suffix of ['.ts', '.tsx', '.js', '/index.ts', '/index.tsx']) {
          if (existsSync(base + suffix)) return nextResolve(pathToFileURL(base + suffix).href, context);
        }
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.sql')) return {
      format: 'module', shortCircuit: true,
      source: 'export default ' + JSON.stringify(readFileSync(fileURLToPath(url), 'utf8')),
    };
    if (/\.tsx?$/.test(url)) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      }).outputText,
    };
    return nextLoad(url, context);
  },
});
