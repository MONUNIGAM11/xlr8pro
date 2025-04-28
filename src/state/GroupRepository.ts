import { RequestGroup } from '../models/RequestGroup';

/**
 * Repository for managing Request groups (in-memory)
 */
export class GroupRepository {
  private groups = new Map<string, RequestGroup>();

  add(group: RequestGroup): RequestGroup {
    this.groups.set(group.key, group);
    return group;
  }

  get(key: string): RequestGroup | undefined {
    return this.groups.get(key);
  }

  activateCooldown(groupKey: string, durationMs: number): void {
    const group = this.groups.get(groupKey);
    if (group) {
      group.cooldownUntil = new Date(Date.now() + durationMs);
    }
  }

  recordSuccess(groupKey: string): void {
    // Placeholder: increment success count, clear cooldown, etc.
  }

  recordFailure(groupKey: string): void {
    // Placeholder: increment failure count, trigger cooldown, etc.
  }
}

// Export singleton instance
export const groupRepository = new GroupRepository();
