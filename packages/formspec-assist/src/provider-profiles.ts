/** @filedesc Profile matching, guarded application, and learning from current form values. */
import type { IFormEngine } from '@formspec-org/engine';
import type { ContextResolver } from './context-resolver.js';
import { AssistError, toolError } from './errors.js';
import { ProfileMatcher, toWireMatch, type ResolvedProfileMatch } from './profile-matcher.js';
import { ProfileStore } from './profile-store.js';
import { isEmptyValue } from './provider-fields.js';
import type { ProviderWrites, WriteRequest } from './provider-writes.js';
import type { AssistProviderOptions, ProfileApplyResult, ProfileMatch, UserProfile } from './types.js';

export class ProviderProfiles {
  private readonly profileStore: ProfileStore;
  private currentProfile?: UserProfile;
  private readonly matcher: ProfileMatcher;
  private readonly now: () => Date;
  private readonly confirmProfileApply?: AssistProviderOptions['confirmProfileApply'];
  public capable: boolean;

  public constructor(
    private readonly getEngine: () => IFormEngine,
    private readonly resolver: ContextResolver,
    private readonly writes: ProviderWrites,
    options: AssistProviderOptions,
    private readonly enableCapability: () => Promise<void>,
  ) {
    this.profileStore = new ProfileStore(options.storage);
    this.capable = options.profile !== undefined || options.storage !== undefined;
    this.currentProfile = options.profile ?? this.profileStore.load('default') ?? this.profileStore.load();
    this.now = options.now ?? (() => new Date());
    this.confirmProfileApply = options.confirmProfileApply;
    this.matcher = new ProfileMatcher((path) => this.resolver.resolveConcept(path), options.profileMatchThreshold);
  }

  private get engine(): IFormEngine { return this.getEngine(); }

  public load(profile: UserProfile): Promise<void> {
    this.currentProfile = profile;
    this.profileStore.save(profile);
    return this.enableCapability();
  }

  public matchProfile(profileRef?: string): ProfileMatch[] {
    return this.resolveProfileMatches(profileRef).map(toWireMatch);
  }

  /** The current match set with values — what `profile.apply` writes from. Never leaves the page. */
  private resolveProfileMatches(profileRef?: string): ResolvedProfileMatch[] {
    return this.matcher.match(
      this.resolveProfile(profileRef),
      this.engine.getFieldPaths().filter((path) => {
        const vm = this.engine.getFieldVM(path);
        return this.engine.isPathRelevant(path) && !!vm && !vm.readonly.value;
      }),
    );
  }

  /**
   * Assist spec §3.5: values come from the current match set, never from tool input. Every path that
   * cannot be written is decided before confirmation, so the respondent only ever approves values that
   * will land; the write itself re-runs the same checks, since the form may move while the dialog is up.
   */
  public async applyProfile(
    paths: Array<{ path: string; expected?: unknown }> | undefined,
    confirm: boolean,
    signal?: AbortSignal,
  ): Promise<ProfileApplyResult> {
    if (confirm && !this.confirmProfileApply) {
      throw new AssistError('x-confirmation-required', 'Profile application requires an explicit confirmation handler');
    }
    const matches = new Map(this.resolveProfileMatches().map((match) => [match.path, match]));
    const skipped: Array<{ path: string; reason: string }> = [];
    const pending: WriteRequest[] = [];
    const requested: Array<{ path: string; expected?: unknown }> = paths ?? [...matches.keys()].map((path) => ({ path }));
    for (const { path, expected } of requested) {
      const located = this.writes.locateWritable(path);
      const match = matches.get(path);
      const plan = 'code' in located
        ? located
        // Writable, so the matcher saw the field and had nothing for it (§6.2).
        : !match ? toolError('x-not-matched', `No profile match for ${path}`, path)
          : this.writes.guardWrite(located, { path, value: match.value, expected });
      if ('code' in plan) {
        skipped.push({ path, reason: plan.code });
      } else {
        pending.push({ path, value: plan.value, expected });
      }
    }

    if (confirm && pending.length > 0) {
      const approved = await this.confirmProfileApply!({ matches: pending.map(({ path, value }) => ({ path, value })), signal });
      if (signal?.aborted) {
        throw new AssistError('x-cancelled', 'Tool execution was cancelled before the values were applied');
      }
      if (!approved) {
        return {
          filled: [],
          skipped: [...skipped, ...pending.map(({ path }) => ({ path, reason: 'DECLINED' }))],
          validation: this.engine.getValidationReport(),
        };
      }
    }

    const filled: Array<{ path: string }> = [];
    for (const request of pending) {
      const result = this.writes.trySetField(request);
      if ('code' in result) {
        skipped.push({ path: request.path, reason: result.code });
      } else {
        filled.push({ path: request.path });
      }
    }
    return {
      filled,
      skipped,
      validation: this.engine.getValidationReport(),
    };
  }

  public learnProfile(profileRef?: string): { savedConcepts: number; savedFields: number } {
    const definition = this.engine.getDefinition();
    const timestamp = this.now().toISOString();
    const targetProfileRef = profileRef ?? this.currentProfile?.id ?? 'default';
    const profile = this.profileStore.load(targetProfileRef) ?? (
      this.currentProfile && this.currentProfile.id === targetProfileRef
        ? this.currentProfile
        : {
          id: targetProfileRef,
          label: targetProfileRef === 'default' ? 'Default' : targetProfileRef,
          created: timestamp,
          updated: timestamp,
          concepts: {},
          fields: {},
        }
    );

    let savedConcepts = 0;
    let savedFields = 0;
    for (const path of this.engine.getFieldPaths()) {
      if (!this.engine.isPathRelevant(path)) {
        continue;
      }
      const value = this.engine.getFieldVM(path)?.value.value;
      if (isEmptyValue(value)) {
        continue;
      }
      const concept = this.resolver.resolveConcept(path);
      const entry = {
        value,
        confidence: 1,
        source: {
          type: 'form-fill' as const,
          formUrl: definition.url,
          fieldPath: path,
          timestamp,
        },
        lastUsed: timestamp,
        verified: true,
      };
      if (concept?.concept) {
        profile.concepts[concept.concept] = entry;
        savedConcepts += 1;
      } else {
        profile.fields[path] = entry;
        savedFields += 1;
      }
    }
    profile.updated = timestamp;
    if (!profileRef || this.currentProfile?.id === targetProfileRef || !this.currentProfile) {
      this.currentProfile = profile;
    }
    this.profileStore.save(profile);
    void this.enableCapability();
    return { savedConcepts, savedFields };
  }

  private resolveProfile(profileRef?: string): UserProfile | undefined {
    if (profileRef) {
      return this.profileStore.load(profileRef);
    }
    return this.currentProfile ?? this.profileStore.load('default') ?? this.profileStore.load();
  }

}
