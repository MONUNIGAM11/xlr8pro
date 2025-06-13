/**
 * RequestGroup entity model
 * Represents a group of related requests with shared rate limiting and cooldown
 */
export class RequestGroup {
  key: string;
  activeRequestCount: number;
  successCount: number;
  failureCount: number;
  cooldownUntil: Date | null;
  lastActiveAt: Date;
  avgResponseTime: number;
  responseTimeSamples: number;
  customSettings: Record<string, any> | null;

  /**
   * Create a new RequestGroup
   * @param {string} key - Group key
   * @param {Object} data - Group data
   */
  constructor(key: string, data: Partial<RequestGroup> = {}) {
    this.key = key;
    this.activeRequestCount = data.activeRequestCount || 0;
    this.successCount = data.successCount || 0;
    this.failureCount = data.failureCount || 0;
    this.cooldownUntil = data.cooldownUntil || null;
    this.lastActiveAt = data.lastActiveAt || new Date();
    this.avgResponseTime = data.avgResponseTime || 0;
    this.responseTimeSamples = data.responseTimeSamples || 0;
    this.customSettings = data.customSettings || null;
  }

  /**
   * Check if this group is in cooldown
   * @returns {boolean} Whether this group is in cooldown
   */
  isInCooldown(): boolean {
    if (!this.cooldownUntil) return false;
    return this.cooldownUntil > new Date();
  }

  /**
   * Get the remaining cooldown time in ms
   * @returns {number} Remaining cooldown time in ms
   */
  getRemainingCooldownMs(): number {
    if (!this.isInCooldown()) return 0;
    return this.cooldownUntil!.getTime() - Date.now();
  }

  /**
   * Activate cooldown for this group
   * @param {number} durationMs - Cooldown duration in ms
   */
  activateCooldown(durationMs: number): void {
    this.cooldownUntil = new Date(Date.now() + durationMs);
  }

  /**
   * Increment active request count
   */
  incrementActiveRequests(): void {
    this.activeRequestCount++;
    this.lastActiveAt = new Date();
  }

  /**
   * Decrement active request count (never below 0)
   */
  decrementActiveRequests(): void {
    this.activeRequestCount = Math.max(0, this.activeRequestCount - 1);
    this.lastActiveAt = new Date();
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    this.successCount++;
    this.decrementActiveRequests();
  }

  /**
   * Record a failed request
   */
  recordFailure(): void {
    this.failureCount++;
    this.decrementActiveRequests();
  }

  /**
   * Reset failure count
   */
  resetFailureCount(): void {
    this.failureCount = 0;
  }

  /**
   * Update average response time with new sample
   * @param {number} responseTimeMs - Response time in ms
   */
  updateResponseTime(responseTimeMs: number): void {
    // Weighted moving average
    this.avgResponseTime = 
      (this.avgResponseTime * this.responseTimeSamples + responseTimeMs) / 
      (this.responseTimeSamples + 1);
    this.responseTimeSamples++;
  }

  /**
   * Get custom setting value or default
   * @param {string} key - Setting key
   * @param {any} defaultValue - Default value
   * @returns {any} Setting value or default
   */
  getSetting<T>(key: string, defaultValue: T): T {
    if (!this.customSettings) return defaultValue;
    return this.customSettings[key] !== undefined ? 
      this.customSettings[key] as T : defaultValue;
  }

  /**
   * Convert to a plain object for serialization
   * @returns {Object} Plain object representation
   */
  toJSON(): Record<string, any> {
    return {
      key: this.key,
      activeRequestCount: this.activeRequestCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      cooldownUntil: this.cooldownUntil ? this.cooldownUntil.toISOString() : null,
      lastActiveAt: this.lastActiveAt.toISOString(),
      avgResponseTime: this.avgResponseTime,
      responseTimeSamples: this.responseTimeSamples,
      customSettings: this.customSettings
    };
  }

  /**
   * Create a RequestGroup from a plain object
   * @param {string} key - Group key
   * @param {Object} data - Plain object representation
   * @returns {RequestGroup} New RequestGroup instance
   */
  static fromJSON(key: string, data: Record<string, any>): RequestGroup {
    return new RequestGroup(key, {
      ...data,
      cooldownUntil: data.cooldownUntil ? new Date(data.cooldownUntil) : null,
      lastActiveAt: data.lastActiveAt ? new Date(data.lastActiveAt) : new Date()
    });
  }
} 