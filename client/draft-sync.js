const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Three-way merge: only apply an edit automatically when the other creator
// left that field unchanged. Conflicting fields keep the local value for review.
export function mergeDraft(base, local, remote) {
  const conflicts = [];
  function merge(before, mine, theirs, path) {
    if (same(mine, theirs) || same(theirs, before))
      return structuredClone(mine);
    if (same(mine, before)) return structuredClone(theirs);
    // A type change can remove type-specific fields. Do not silently discard
    // another creator's edits when both touched a question during that change.
    if (
      before?.type &&
      mine?.type &&
      theirs?.type &&
      mine.type !== theirs.type &&
      (mine.type !== before.type || theirs.type !== before.type)
    ) {
      conflicts.push(path + ".type");
      return structuredClone(mine);
    }
    if (
      before &&
      mine &&
      theirs &&
      !Array.isArray(before) &&
      typeof before === "object" &&
      typeof mine === "object" &&
      typeof theirs === "object"
    ) {
      const result = {};
      for (const key of new Set([
        ...Object.keys(before),
        ...Object.keys(mine),
        ...Object.keys(theirs),
      ])) {
        const value = merge(
          before[key],
          mine[key],
          theirs[key],
          path ? `${path}.${key}` : key,
        );
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    conflicts.push(path);
    return structuredClone(mine);
  }

  const result = merge(
    { ...base, questions: undefined },
    { ...local, questions: undefined },
    { ...remote, questions: undefined },
    "",
  );
  const maps = [base, local, remote].map(
    (draft) => new Map(draft.questions.map((q) => [q.id, q])),
  );
  const questions = new Map();
  for (const id of new Set(maps.flatMap((map) => [...map.keys()]))) {
    const value = merge(
      maps[0].get(id),
      maps[1].get(id),
      maps[2].get(id),
      `Question ${id}`,
    );
    if (value !== undefined) questions.set(id, value);
  }
  // Compare ordering only for questions that existed in all three drafts.
  // Independent insertions/deletions can coexist without manufacturing a conflict.
  const common = base.questions
    .map((q) => q.id)
    .filter((id) => maps[1].has(id) && maps[2].has(id));
  const order = (draft) =>
    draft.questions.map((q) => q.id).filter((id) => common.includes(id));
  const baseOrder = order(base),
    mine = order(local),
    theirs = order(remote);
  const mineChanged = !same(mine, baseOrder),
    theirsChanged = !same(theirs, baseOrder);
  if (mineChanged && theirsChanged && !same(mine, theirs))
    conflicts.push("Question order");
  const localIdsUnchanged = same(
    local.questions.map((q) => q.id),
    base.questions.map((q) => q.id),
  );
  const preferred =
    !mineChanged && (theirsChanged || localIdsUnchanged) ? remote : local;
  const other = preferred === remote ? local : remote;
  const ids = [
    ...new Set([...preferred.questions, ...other.questions].map((q) => q.id)),
  ];
  result.questions = ids
    .filter((id) => questions.has(id))
    .map((id) => questions.get(id));
  return { draft: result, conflicts };
}
