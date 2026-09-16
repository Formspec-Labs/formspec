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
): RecipeStep[] | null {
    const known = engine.getFieldPaths();
    const knownSet = new Set(known);
    const baseOf = (p: string) => p.replace(/\[\d+\]/g, '');
    const parent = path.replace(/\.[^.]+$/, '');

    // A dependency without indices, inside the target's own repeat rows, means that row's field.
    const rowed = (dep: string): string => {
        let out = dep;
        for (const m of path.matchAll(/\[(\d+)\]/g)) {
            const prefix = path.slice(0, m.index);
            const base = baseOf(prefix);
            if (out.startsWith(`${base}.`)) out = `${prefix}[${m[1]}]${out.slice(base.length)}`;
        }
        return out;
    };

    const resolve = (dep: string, expression: string): string[] => {
        const direct = [dep, rowed(dep), `${parent}.${dep}`].filter((c) => knownSet.has(c));
        if (direct.length) return [direct[0]];
        // A group: the fields beneath it, the ones the expression names first.
        const under = known.filter((p) => baseOf(p).startsWith(`${baseOf(dep)}.`)).map(rowed);
        const named = under.filter((p) => expression.includes(p.split('.').pop()!.replace(/\[\d+\]/g, '')));
        return (named.length ? named : under).slice(0, 6);
    };

    // Only what can be enumerated: a choice's options, a boolean's two values. A date or a text has no
    // value the documents name, so it is never guessed.
    const candidates = (dep: string): unknown[] => {
        const opts = optionValues[baseOf(dep)] ?? engine.getOptions(dep)?.map((o) => o.value) ?? [];
        if (opts.length) return opts;
        return engine.getFieldVM(dep)?.dataType === 'boolean' ? [true, false] : [];
    };

    const applied: RecipeStep[] = [];
    const set = (dep: string, value: unknown) => {
        applied.push({ path: dep, value, previous: engine.getFieldVM(dep)?.value?.value ?? null });
        engine.setValue(dep, value);
    };
    const undoLast = () => {
        const a = applied.pop();
        if (a) engine.setValue(a.path, a.previous);
    };

    for (let round = 0; round < 6 && !engine.isPathRelevant(path); round += 1) {
        const why = engine.whyRelevant(path);
        const deps = (why.dependsOn ?? []).flatMap((d) => resolve(d, why.expression ?? ''));
        if (!deps.length) break;
        const advanced = () => engine.isPathRelevant(path) || engine.whyRelevant(path).bindId !== why.bindId;
        let done = false;
        for (const dep of deps) {
            for (const value of candidates(dep)) {
                set(dep, value);
                if (advanced()) { done = true; break; }
                undoLast();
            }
            if (done) break;
        }
        if (!done && deps.length >= 2) {
            const [a, b] = deps;
            outer: for (const va of candidates(a)) for (const vb of candidates(b)) {
                set(a, va);
                set(b, vb);
                if (advanced()) { done = true; break outer; }
                undoLast();
                undoLast();
            }
        }
        if (!done) break;
    }
    if (!engine.isPathRelevant(path)) {
        while (applied.length) undoLast();
        return null;
    }
    return applied;
}

/** Whether a relevance expression reads something the documents alone cannot set: host-supplied instance data. */
export function needsHostData(expression: string | null | undefined): boolean {
    return /@instance\s*\(/.test(expression ?? '');
}
