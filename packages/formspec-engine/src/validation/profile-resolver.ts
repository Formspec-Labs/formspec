import type { ValidationProfile } from '@formspec-org/types';

/** Engine-internal validation trigger vocabulary. */
export type ValidationTrigger = 'continuous' | 'submit' | 'demand' | 'disabled';

export type ValidationReportOptions = {
    profile?: ValidationProfile;
};

export type EnabledValidationProfile = Exclude<ValidationProfile, 'off'>;

const PROFILE_TO_TRIGGER: Record<ValidationProfile, ValidationTrigger> = {
    live: 'continuous',
    'on-submit': 'submit',
    'on-demand': 'demand',
    off: 'disabled',
};

/**
 * Bridges the closed Validation Mapping profile enum to the engine's internal trigger vocabulary.
 */
export class DefaultValidationProfileResolver {
    public resolve(profile: ValidationProfile): ValidationTrigger {
        const trigger = PROFILE_TO_TRIGGER[profile];
        if (trigger === undefined) {
            throw new Error(`Unknown validation profile: ${profile}`);
        }
        return trigger;
    }
}
