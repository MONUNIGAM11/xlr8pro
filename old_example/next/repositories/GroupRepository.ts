import { RequestGroup } from '../models/RequestGroup.js';
import { eventBus, EventType } from '../events/EventBus.js';

/**
 * Repository for managing RequestGroup entities
 */
export class GroupRepository {
  private groups: Map<string, RequestGroup> = new Map();
  private cooldownTimers: Map<string, NodeJS.Timeout> = new Map();
  private eventBus: any;

  constructor() {
    this.eventBus = eventBus;
    console.log('Group repository initialized');
  }

  /**
   * Get or create a request group
   * @param {string} groupKey - Group key
   * @returns {RequestGroup} Request group
   */
  getOrCreate(groupKey: string): RequestGroup {
    if (!this.groups.has(groupKey)) {
      this.groups.set(groupKey, new RequestGroup(groupKey));
    }
    
    return this.groups.get(groupKey)!;
  }

  /**
   * Check if a group exists
   * @param {string} groupKey - Group key
   * @returns {boolean} Whether the group exists
   */
  exists(groupKey: string): boolean {
    return this.groups.has(groupKey);
  }

  /**
   * Get a group
   * @param {string} groupKey - Group key
   * @returns {RequestGroup|null} Request group or null if not found
   */
  get(groupKey: string): RequestGroup | null {
    return this.groups.get(groupKey) || null;
  }

  /**
   * Activate cooldown for a group
   * @param {string} groupKey - Group key
   * @param {number} durationMs - Cooldown duration in ms
   */
  activateCooldown(groupKey: string, durationMs: number): void {
    const group = this.getOrCreate(groupKey);
    group.activateCooldown(durationMs);
    
    // Clear existing timer if any
    if (this.cooldownTimers.has(groupKey)) {
      clearTimeout(this.cooldownTimers.get(groupKey)!);
    }
    
    // Set timer for cooldown expiration
    const timerId = setTimeout(() => {
      this.cooldownTimers.delete(groupKey);
      
      // Publish cooldown expired event
      this.eventBus.publish({
        type: EventType.COOLDOWN_EXPIRED,
        groupKey,
        timestamp: new Date()
      });
      
    }, durationMs);
    
    this.cooldownTimers.set(groupKey, timerId);
    
    // Publish cooldown activated event
    this.eventBus.publish({
      type: EventType.COOLDOWN_ACTIVATED,
      groupKey,
      payload: {
        durationMs,
        cooldownUntil: group.cooldownUntil
      },
      timestamp: new Date()
    });
  }

  /**
   * Check if a group is in cooldown
   * @param {string} groupKey - Group key
   * @returns {boolean} Whether the group is in cooldown
   */
  isInCooldown(groupKey: string): boolean {
    const group = this.get(groupKey);
    return group ? group.isInCooldown() : false;
  }

  /**
   * Get remaining cooldown time for a group
   * @param {string} groupKey - Group key
   * @returns {number} Remaining cooldown time in ms
   */
  getRemainingCooldownMs(groupKey: string): number {
    const group = this.get(groupKey);
    return group ? group.getRemainingCooldownMs() : 0;
  }

  /**
   * Record a successful request for a group
   * @param {string} groupKey - Group key
   */
  recordSuccess(groupKey: string): void {
    const group = this.getOrCreate(groupKey);
    group.recordSuccess();
  }

  /**
   * Record a failed request for a group
   * @param {string} groupKey - Group key
   */
  recordFailure(groupKey: string): void {
    const group = this.getOrCreate(groupKey);
    group.recordFailure();
  }

  /**
   * Increment active request count for a group
   * @param {string} groupKey - Group key
   */
  incrementActiveRequests(groupKey: string): void {
    const group = this.getOrCreate(groupKey);
    group.incrementActiveRequests();
  }

  /**
   * Get all active request groups
   * @returns {RequestGroup[]} Array of active groups
   */
  getActiveGroups(): RequestGroup[] {
    return Array.from(this.groups.values())
      .filter(group => group.activeRequestCount > 0);
  }

  /**
   * Get all groups in cooldown
   * @returns {RequestGroup[]} Array of groups in cooldown
   */
  getGroupsInCooldown(): RequestGroup[] {
    return Array.from(this.groups.values())
      .filter(group => group.isInCooldown());
  }

  /**
   * Serialize repository state
   * @returns {Record<string, any>} Serialized state
   */
  serialize(): Record<string, any> {
    return {
      groups: Array.from(this.groups.entries())
        .map(([key, group]) => [key, group.toJSON()])
    };
  }

  /**
   * Deserialize repository state
   * @param {Record<string, any>} data - Serialized state
   */
  deserialize(data: Record<string, any>): void {
    this.groups.clear();
    
    // Clear all cooldown timers
    for (const timerId of this.cooldownTimers.values()) {
      clearTimeout(timerId);
    }
    this.cooldownTimers.clear();
    
    if (data.groups) {
      for (const [key, groupData] of data.groups) {
        this.groups.set(key, RequestGroup.fromJSON(key, groupData));
        
        // Reactivate cooldown timers if needed
        const group = this.groups.get(key)!;
        if (group.isInCooldown()) {
          const remainingMs = group.getRemainingCooldownMs();
          
          if (remainingMs > 0) {
            const timerId = setTimeout(() => {
              this.cooldownTimers.delete(key);
              
              // Publish cooldown expired event
              this.eventBus.publish({
                type: EventType.COOLDOWN_EXPIRED,
                groupKey: key,
                timestamp: new Date()
              });
              
            }, remainingMs);
            
            this.cooldownTimers.set(key, timerId);
          }
        }
      }
    }
  }

  isGroupAtCapacity(groupKey: string, limit: number): boolean {
    const group = this.get(groupKey);
    if (!group) return false;
    
    // Use active count, not just incrementing counter
    return group.activeRequestCount >= limit;
  }
}

// Export singleton instance
export const groupRepository = new GroupRepository(); 