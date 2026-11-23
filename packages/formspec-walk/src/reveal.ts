/** @filedesc Reveal search: the enumerable values that make a conditional field relevant, found against any engine — in-page or in Node. */

/** One value the search set, with what it replaced. */
export interface RecipeStep {
    path: string;
    value: unknown;
    previous: unknown;
}

/** The engine surface the search needs (the FormEngine has it, in the page and in Node). */
export interface RevealEngine {
    getFieldPaths(): string[];
    getDraftSnapshot(): { data: Record<string, unknown> };
    isPathRelevant(path: string): boolean;
    whyRelevant(path: string): { bindId: string | null; expression: string | null; dependsOn: string[] };
    getFieldVM(path: string): { value?: { value?: unknown }; dataType?: string } | undefined;
    getOptions(path: string): Array<{ value: unknown }> | undefined;
    setValue(path: string, value: unknown): void;
}

/**
 * Try enumerable driver values from the outermost blocked path inward. Keep an ancestor open while
 * solving its descendants, and backtrack to another answer if that branch cannot reach the field.
 * Everything tried and not kept is undone. The bounded search returns the steps to replay, or null.
 *
 * `whyRelevant().dependsOn` names root identifiers as the bind's FEL reads them: a sibling key inside a
 * repeat row (`receivedRetirement`), a top-level field, or a group (`g` for `g.gon = true`). Each is
 * resolved to the field paths it can mean — itself, that name inside the target's own row, the fields
 * under that group whose key the expression mentions — before its values are tried.
 *
 * Self-contained on purpose: this function is also shipped into the page by source and run there.
 */
export function revealSearch(
    engine: RevealEngine,
    path: string,
    optionValues: Record<string, unknown[]>,
    steps?: Array<{ path: string; value: unknown }>,
): RecipeStep[] | null {
    const known = engine.getFieldPaths();
    const knownSet = new Set(known);
    const baseOf = (p: string) => p.replace(/\[\d+\]/g, '');
    const resolve = (target: string, dep: string, expression: string): string[] => {
        const parent = target.split('.').slice(0, -1).join('.');
        const sibling = parent ? `${parent}.${dep}` : dep;
        if (knownSet.has(sibling)) return [sibling];
        if (knownSet.has(dep)) return [dep];
        // Group dependencies may name a group rather than its field. Keep row-local reads in that row.
        const row = target.slice(0, target.lastIndexOf(']') + 1);
        const fields = known.filter(p => baseOf(p) === dep || baseOf(p).startsWith(`${dep}.`));
        const local = row ? fields.filter(p => p.startsWith(`${row}.`)) : [];
        const under = local.length ? local : fields;
        const named = under.filter((p) => expression.includes(p.split('.').pop()!.replace(/\[\d+\]/g, '')));
        return (named.length ? named : under).slice(0, 6);
    };

    // Only what can be enumerated: a choice's options, a boolean's two values. A date or a text has no
    // value the documents name, so it is never guessed.
    function* candidates(dep: string): Iterable<unknown> {
        const field = engine.getFieldVM(dep);
        const opts = optionValues[baseOf(dep)] ?? engine.getOptions(dep)?.map((o) => o.value) ?? [];
        if (field?.dataType === 'multiChoice') {
            const value = field.value?.value;
            const selected: unknown[] = Array.isArray(value) ? value : [];
            if (selected.length) {
                for (const option of opts) if (!selected.includes(option)) yield [...selected, option];
            }
            for (const option of opts) yield [option];
            if (selected.length) yield [];
            for (const [i, first] of opts.entries()) {
                for (const second of opts.slice(i + 1)) yield [first, second];
            }
        } else {
            yield* opts.length ? opts : field?.dataType === 'boolean' ? [true, false] : [];
        }
    }

    const applied: RecipeStep[] = [];
    // The view model displays missing answers as null. Only the draft retains missing vs authored null.
    const original = engine.getDraftSnapshot().data;
    const edited = new Map<string, unknown>();
    const previousValue = (dep: string) => {
        if (edited.has(dep)) return edited.get(dep);
        return dep.replace(/\[(\d+)\]/g, '.$1').split('.').reduce<unknown>(
            (at, key) => at && typeof at === 'object' ? (at as Record<string, unknown>)[key] : undefined, original,
        );
    };
    const set = (dep: string, value: unknown) => {
        applied.push({ path: dep, value, previous: previousValue(dep) });
        edited.set(dep, value);
        engine.setValue(dep, value);
    };
    const undoTo = (length: number) => {
        while (applied.length > length) {
            const step = applied.pop()!;
            edited.set(step.path, step.previous);
            engine.setValue(step.path, step.previous);
        }
    };

    if (steps) {
        for (const step of steps) set(step.path, step.value);
        if (engine.isPathRelevant(path)) return applied;
        undoTo(0);
        return null;
    }

    const visiting = new Set<string>();
    // Dependency cycles, choice combinations and backtracking all share one edit budget per target.
    let editsLeft = 256;
    const enable = (target: string): boolean => {
        if (visiting.has(target)) return false;
        visiting.add(target);
        const parts = target.split('.');
        const ancestors = parts.map((_, i) => parts.slice(0, i + 1).join('.'));
        const solve = (): boolean => {
            const blocked = ancestors.find(p => !engine.isPathRelevant(p));
            if (!blocked) return true;
            if (!editsLeft) return false;
            const why = engine.whyRelevant(blocked);
            const deps = [...new Set(why.dependsOn.flatMap(d => resolve(blocked, d, why.expression ?? '')))];
            const tryDrivers = (drivers: string[]): boolean => {
                if (!drivers.length) return engine.isPathRelevant(blocked) && solve();
                const [dep, ...rest] = drivers;
                const checkpoint = applied.length;
                if (!enable(dep)) return false;
                for (const value of candidates(dep)) {
                    if (!editsLeft) break;
                    if (!engine.isPathRelevant(dep)) break;
                    const before = applied.length;
                    editsLeft -= 1;
                    set(dep, value);
                    if (tryDrivers(rest)) return true;
                    undoTo(before);
                }
                undoTo(checkpoint);
                return false;
            };
            return deps.some(dep => tryDrivers([dep])) || (deps.length >= 2 && tryDrivers(deps.slice(0, 2)));
        };
        try {
            return solve();
        } finally {
            visiting.delete(target);
        }
    };
    return enable(path) ? applied : null;
}

/** Whether a relevance expression reads something the documents alone cannot set: host-supplied instance data. */
export function needsHostData(expression: string | null | undefined): boolean {
    return /@instance\s*\(/.test(expression ?? '');
}

/** The target has a literal false bind on itself or an ancestor, with no possible indexed override. */
export function intentionallyHidden(path: string, binds: ReadonlyArray<{
    path: string;
    relevant?: string;
    disabledDisplay?: string;
}>): boolean {
    const baseOf = (p: string) => p.replace(/\[[^\]]+\]/g, '');
    const target = baseOf(path);
    const effective = new Map<string, { relevant?: string; disabledDisplay?: string }>();
    const indexed = new Set<string>();
    for (const bind of binds) {
        const base = baseOf(bind.path);
        if (target !== base && !target.startsWith(base + '.')) continue;
        if (/\[(?!\*\])/.test(bind.path)) indexed.add(base);
        else effective.set(base, { ...effective.get(base), ...bind });
    }
    return [...effective].some(([base, bind]) => !indexed.has(base) && typeof bind.relevant === 'string'
        && bind.relevant.trim() === 'false' && bind.disabledDisplay !== 'protected');
}
