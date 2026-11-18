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
 * Search for values that make `path` relevant, one governing bind at a time from the outermost: try each
 * dependency's enumerable values alone, then the first two together; a value counts when the field becomes
 * relevant or the governing bind moves inward (an ancestor's holds, the field's own is next). Everything
 * tried and not kept is undone. Returns the steps to replay, or null when nothing enumerable reveals it.
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
    const candidates = (dep: string): unknown[] => {
        const opts = optionValues[baseOf(dep)] ?? engine.getOptions(dep)?.map((o) => o.value) ?? [];
        if (opts.length) return engine.getFieldVM(dep)?.dataType === 'multiChoice' ? opts.map(v => [v]) : opts;
        return engine.getFieldVM(dep)?.dataType === 'boolean' ? [true, false] : [];
    };

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
    const enable = (target: string): boolean => {
        if (engine.isPathRelevant(target)) return true;
        if (visiting.has(target)) return false;
        visiting.add(target);
        const start = applied.length;
        const tried = new Set<string | null>();
        while (!engine.isPathRelevant(target)) {
            const why = engine.whyRelevant(target);
            if (tried.has(why.bindId)) break;
            tried.add(why.bindId);
            const deps = [...new Set(why.dependsOn.flatMap(d => resolve(target, d, why.expression ?? '')))];
            const advanced = () => engine.isPathRelevant(target) || engine.whyRelevant(target).bindId !== why.bindId;
            // Try a single driver first, then the original two-driver conjunction.
            const tryDrivers = (drivers: string[]): boolean => {
                if (!drivers.length) return advanced();
                const [dep, ...rest] = drivers;
                const checkpoint = applied.length;
                if (!enable(dep)) return false;
                for (const value of candidates(dep)) {
                    const before = applied.length;
                    set(dep, value);
                    if (tryDrivers(rest)) return true;
                    undoTo(before);
                }
                undoTo(checkpoint);
                return false;
            };
            if (!deps.some(dep => tryDrivers([dep])) && !(deps.length >= 2 && tryDrivers(deps.slice(0, 2)))) break;
        }
        visiting.delete(target);
        if (engine.isPathRelevant(target)) return true;
        undoTo(start);
        return false;
    };
    return enable(path) ? applied : null;
}

/** Whether a relevance expression reads something the documents alone cannot set: host-supplied instance data. */
export function needsHostData(expression: string | null | undefined): boolean {
    return /@instance\s*\(/.test(expression ?? '');
}
