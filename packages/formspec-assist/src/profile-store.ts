/** @filedesc Persistent profile storage for formspec-assist. */

import type { StorageBackend, UserProfile } from './types.js';

const STORAGE_KEY = 'formspec-assist:profiles';

class MemoryStorage implements StorageBackend {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function defaultStorage(): StorageBackend {
  return new MemoryStorage();
}

export class ProfileStore {
  private readonly storage: StorageBackend;

  public constructor(storage?: StorageBackend) {
    this.storage = storage ?? defaultStorage();
  }

  public load(profileRef?: string): UserProfile | undefined {
    const profiles = this.readAll();
    if (profileRef) {
      return profiles.find((profile) => profile.id === profileRef);
    }
    return profiles[0];
  }

  public save(profile: UserProfile): void {
    const profiles = this.readAll().filter((entry) => entry.id !== profile.id);
    profiles.push(profile);
    this.writeAll(profiles);
  }

  public listProfiles(): Array<{ id: string; label: string; updated: string }> {
    return this.readAll().map(({ id, label, updated }) => ({ id, label, updated }));
  }

  public deleteProfile(id: string): void {
    this.writeAll(this.readAll().filter((profile) => profile.id !== id));
  }

  private readAll(): UserProfile[] {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeAll(profiles: UserProfile[]): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  }
}
