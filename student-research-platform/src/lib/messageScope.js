export function createMessageScope(initialScope) {
  let scope = initialScope, generation = 0;
  return {
    activate(next) { if (scope !== next) { scope = next; generation++; } return generation; },
    writer(emit, owner = scope, version = generation) {
      return text => { if (scope === owner && generation === version) emit({ scope: owner, generation: version, text }); };
    },
    visible(entry) { return entry?.scope === scope && entry.generation === generation ? entry.text : ""; },
  };
}
