/** Resolve older saved name-only transformation references within allowed match cards. */
export function expandNamedCardReferences<T extends {
  id: string;
  name: string;
  status: string;
  effectConfig: unknown;
}>(cards: readonly T[], requiredIds: Set<string>): void {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const visit = (value: unknown, names: Set<string>, ids: Set<string>): void => {
    if (Array.isArray(value)) { value.forEach((entry) => visit(entry, names, ids)); return; }
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if (object.definitionRef && typeof object.definitionRef === 'object') {
      const reference = object.definitionRef as Record<string, unknown>;
      if (typeof reference.id === 'string' && reference.id) ids.add(reference.id);
      else if (typeof reference.name === 'string' && reference.name.trim()) names.add(reference.name.trim());
    }
    Object.values(object).forEach((entry) => visit(entry, names, ids));
  };
  const visited = new Set<string>();
  const eligible = cards.filter((card) => card.status !== 'DISABLED');
  for (;;) {
    const pending = [...requiredIds].filter((id) => !visited.has(id));
    if (!pending.length) break;
    for (const id of pending) {
      visited.add(id);
      const source = byId.get(id);
      if (!source || source.status === 'DISABLED') continue;
      const names = new Set<string>();
      const ids = new Set<string>();
      visit(source.effectConfig, names, ids);
      for (const referenceId of ids) {
        if (eligible.some((candidate) => candidate.id === referenceId)) requiredIds.add(referenceId);
      }
      for (const name of names) {
        const exact = eligible.filter((card) => card.name === name);
        const matches = exact.length ? exact : eligible.filter((card) => card.name.startsWith(`${name} `));
        if (matches.length === 1) requiredIds.add(matches[0]!.id);
      }
    }
  }
}
