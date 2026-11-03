/** Asset failures need a fresh document: React.lazy retains its rejected import. */
export function isScreenAssetFailure(error: Error): boolean {
  return /ChunkLoadError|Loading (?:CSS )?chunk [\s\S]*failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    error.name + ": " + error.message,
  );
}
