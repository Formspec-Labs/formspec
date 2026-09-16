/** @filedesc Definition → accessibility walk plan: the names, states and structure a rendered form must present, from the documents alone. */
import { UI_STRINGS, fillUiParams } from '@formspec-org/layout';
import type { FormDefinition, FormItem, LocaleDocument, OptionEntry, ThemeDocument } from '@formspec-org/types';

/** A string the documents promise. `pattern` stands in when the source interpolates `{{…}}` at runtime. */
export interface ExpectedText {
    text: string;
    pattern?: RegExp;
}

export interface PlanOption {
    value: string;
    label: ExpectedText;
}

export interface PlanRepeat {
    /** How one instance is named (`<key>.rowLabel`, else `$ui.repeat.row`); an adapter may say more after it ("… of 3"). */
    rowName: ExpectedText;
    /** Absent when the Theme turns adding off (`widgetConfig.allowAdd: false`). */
    addLabel?: ExpectedText;
    /** Accessible name of one instance's Remove control; absent when the Theme turns removing off. */
    removeLabel?: ExpectedText;
    minRepeat: number;
    maxRepeat?: number;
}

export interface PlanGroup {
    path: string;
    key: string;
    /** Announced as a heading even when the Theme hides it visually (core §4.2.5: a hidden label stays in the accessible tree). */
    label: ExpectedText;
    repeat?: PlanRepeat;
}

export interface PlanField {
    /** Bind-style path: dotted keys, no indices. Instances of a repeat are expanded by the walk. */
    path: string;
    key: string;
    dataType: string;
    label: ExpectedText;
    hint?: ExpectedText;
    /** `true` / `false` when the bind is literal; `'engine'` when an expression decides at runtime. */
    required: boolean | 'engine';
    /** The REQUIRED message a Locale authors (§3.1.4: `<key>.errors.REQUIRED`, else `<key>.requiredMessage`); absent means the processor's own. */
    requiredMessage?: ExpectedText;
    options?: PlanOption[];
    /** Enclosing groups, outermost first. */
    groups: PlanGroup[];
    /** Nearest enclosing repeatable group, when any. */
    repeatOf?: string;
    /** Governed by a `relevant` bind — its own or an ancestor's — so it may start hidden. */
    conditional: boolean;
}

export interface PlanDocuments {
    locale?: LocaleDocument;
    /** Theme §4: `items.<key>.widget: 'Hidden'` takes a field off the page; `widgetConfig.allowAdd/allowRemove: false` a repeat's controls. A hidden label stays in the accessible tree, so it changes nothing here. */
    theme?: ThemeDocument;
}

export interface Plan {
    locale: string;
    title: ExpectedText;
    fields: PlanField[];
    groups: PlanGroup[];
    /** What the documents alone cannot decide, one reason per line. */
    uncovered: string[];
}

const isTrue = (v: unknown) => v === true || v === 'true';
const isFalse = (v: unknown) => v === false || v === 'false' || v === undefined || v === null || v === '';

/** Accessible names are text: inline markdown a label may carry (core §4.2.1) does not reach the tree. */
export function stripMarkdown(s: string): string {
    return s
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/(\*\*|__)(.+?)\1/g, '$2')
        .replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?=[^\w*]|$)/g, '$1$2')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Literal text, or a pattern of its literal segments in order when it interpolates. */
export function expected(raw: string): ExpectedText {
    const text = stripMarkdown(raw);
    if (!/\{\{[\s\S]*?\}\}/.test(text)) return { text };
    const parts = text.split(/\{\{[\s\S]*?\}\}/).map((p) => p.trim()).filter(Boolean);
    const escape = (p: string) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return { text, pattern: new RegExp(`^\\s*${parts.map(escape).join('[\\s\\S]*?')}[\\s\\S]*$`) };
}

export function matches(actual: string, want: ExpectedText): boolean {
    const a = actual.replace(/\s+/g, ' ').trim();
    return want.pattern ? want.pattern.test(a) : a === want.text;
}

/** Locale §3.1 string cascade for one Definition-targeted document: a key wins, else the inline text. */
class Strings {
    constructor(private readonly strings: Record<string, string>) {}
    get(key: string, inline: string | undefined): ExpectedText | undefined {
        const s = this.strings[key] ?? inline;
        return typeof s === 'string' && s !== '' ? expected(s) : undefined;
    }
    /** §3.1.10: the closed renderer-chrome inventory, a Locale's `$ui.<key>` first, `{{$param}}`s filled. */
    chrome(key: keyof typeof UI_STRINGS, params: Record<string, string | number>): ExpectedText {
        return expected(fillUiParams(this.strings[`$ui.${key}`] ?? UI_STRINGS[key], params));
    }
    /** §3.1.3: field key, then the OptionSet key, then the inline label. */
    option(fieldKey: string, setName: string | undefined, o: OptionEntry): ExpectedText {
        const value = String(o.value).replace(/\\/g, '\\\\').replace(/\./g, '\\.');
        return (
            this.get(`${fieldKey}.options.${value}.label`, undefined) ??
            (setName ? this.get(`$optionSet.${setName}.${value}.label`, undefined) : undefined) ??
            expected(String(o.label ?? o.value))
        );
    }
}

/**
 * Derive the walk plan for one locale. Pure: reads the Definition and, when given, the Locale document
 * (Locale §3.1 keys: `<key>.label|hint`, `<key>.options.<value>.label`, `$optionSet.<set>.<value>.label`,
 * `<key>.rowLabel|addLabel|removeLabel`) and the Theme's few presentation switches. Anything a runtime
 * decides — expression-valued `required`, which conditional fields show — is marked rather than guessed,
 * so the walk knows where it must ask the engine.
 */
export function derivePlan(definition: FormDefinition, documents: PlanDocuments = {}): Plan {
    const { locale, theme } = documents;
    const strings = new Strings((locale?.strings as Record<string, string> | undefined) ?? {});
    const themed = (key: string) => ((theme?.items ?? {}) as Record<string, { widget?: string; widgetConfig?: Record<string, unknown> }>)[key] ?? {};
    // Bind paths address repeat children through `[*]`; items are keyed by their bare dotted path.
    const binds = new Map((definition.binds ?? []).map((b) => [b.path.replace(/\[\*\]/g, ''), b]));
    const sets = (definition.optionSets ?? {}) as Record<string, { options?: OptionEntry[] }>;
    const fields: PlanField[] = [];
    const groups: PlanGroup[] = [];
    const uncovered: string[] = [];

    const walk = (items: FormItem[], prefix: string, enclosing: PlanGroup[], conditional: boolean, repeatOf?: string) => {
        for (const item of items) {
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            const bind = binds.get(path);
            const isConditional = conditional || (bind?.relevant !== undefined && !isTrue(bind.relevant));
            const label = strings.get(`${item.key}.label`, item.label) ?? { text: '' };

            if (item.type === 'group') {
                const group: PlanGroup = { path, key: item.key, label };
                if (item.repeatable) {
                    const config = themed(item.key).widgetConfig ?? {};
                    // Locale §3.1.1 repeat chrome: an authored string is the name as written (`{{@index}}` and
                    // friends interpolate at runtime); the derived default composes the group's label into the
                    // `$ui.repeat.*` templates, index left open — and an interpolated pattern is open-ended, so
                    // a name an adapter extends ("Line Items 1 of 3") still matches.
                    const l = label.text;
                    group.repeat = {
                        rowName: strings.get(`${item.key}.rowLabel`, undefined) ?? strings.chrome('repeat.row', { label: l, index: '{{index}}' }),
                        ...(config.allowAdd === false ? {} : { addLabel: strings.get(`${item.key}.addLabel`, undefined) ?? strings.chrome('repeat.add', { label: l }) }),
                        ...(config.allowRemove === false ? {} : {
                            removeLabel: strings.get(`${item.key}.removeLabel`, undefined) ?? strings.chrome('repeat.remove', { label: `${l} {{index}}` }),
                        }),
                        minRepeat: item.minRepeat ?? 0,
                        maxRepeat: item.maxRepeat,
                    };
                }
                groups.push(group);
                walk(item.children ?? [], path, [...enclosing, group], isConditional, item.repeatable ? path : repeatOf);
                continue;
            }
            if (item.type !== 'field') continue;
            if (themed(item.key).widget === 'Hidden') { uncovered.push(`${path}: the Theme presents it as Hidden; nothing to see`); continue; }

            const dataType = item.dataType ?? 'string';
            const options = item.options ?? (item.optionSet ? sets[item.optionSet]?.options : undefined);
            if ((dataType === 'choice' || dataType === 'multiChoice') && !options) {
                uncovered.push(`${path}: options come from a remote source; labels not derivable`);
            }
            const required: PlanField['required'] = isTrue(bind?.required) ? true : isFalse(bind?.required) ? false : 'engine';
            if (required === 'engine') uncovered.push(`${path}: required is the expression ${JSON.stringify(bind!.required)}; the engine decides`);
            if (bind?.constraint) uncovered.push(`${path}: constraint ${JSON.stringify(bind.constraint)} needs a violating value; not derived`);

            fields.push({
                path,
                key: item.key,
                dataType,
                label,
                hint: strings.get(`${item.key}.hint`, item.hint),
                required,
                requiredMessage: strings.get(`${item.key}.errors.REQUIRED`, undefined) ?? strings.get(`${item.key}.requiredMessage`, undefined),
                options: options?.map((o) => ({ value: String(o.value), label: strings.option(item.key, item.optionSet, o) })),
                groups: enclosing,
                repeatOf,
                conditional: isConditional,
            });
        }
    };
    walk(definition.items as FormItem[], '', [], false);

    return {
        locale: locale?.locale ?? 'inline',
        title: strings.get('$form.title', definition.title) ?? expected(definition.title),
        fields,
        groups,
        uncovered,
    };
}
