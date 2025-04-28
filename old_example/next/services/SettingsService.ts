/**
 * Default settings interface
 */
export interface DefaultSettings {
  HTTP_PORT: number;
  HTTPS_PORT: number;
  MAX_ATTEMPTS: number;
  DEFAULT_RETRY_DELAY: number;
  GLOBAL_MAX_CONCURRENT_REQUESTS: number;
  MAX_REQUESTS_PER_GROUP: number;
  FAILURE_THRESHOLD: number;
  DEFAULT_CATEGORY_COOLDOWN_PERIOD: number;
  CLEANUP_INTERVAL: number;
  [key: string]: any;
}

/**
 * Service for managing system and organization-specific settings
 */
export class SettingsService {
  private defaultSettings: DefaultSettings;
  private orgSettings: Map<string, Record<string, any>> = new Map();
  private groupSettings: Map<string, Record<string, any>> = new Map();

  constructor(defaultSettings: Partial<DefaultSettings> = {}) {
    this.defaultSettings = {
      // Default system settings
      HTTP_PORT: 11007,
      HTTPS_PORT: 11008,
      MAX_ATTEMPTS: 5,
      DEFAULT_RETRY_DELAY: 10000,
      GLOBAL_MAX_CONCURRENT_REQUESTS: 500,
      MAX_REQUESTS_PER_GROUP: 15,
      FAILURE_THRESHOLD: 5,
      DEFAULT_CATEGORY_COOLDOWN_PERIOD: 10000,
      CLEANUP_INTERVAL: 600000,
      
      // Override with provided defaults
      ...defaultSettings
    };
    
    console.log('Settings service initialized');
  }

  /**
   * Get a system setting
   * @param {K} key - Setting key
   * @returns {DefaultSettings[K]} Setting value
   */
  get<K extends keyof DefaultSettings>(key: K): DefaultSettings[K] {
    return this.defaultSettings[key];
  }

  /**
   * Get max attempts for an organization
   * @param {string} orgId - Organization ID
   * @returns {number} Max attempts
   */
  getMaxAttempts(orgId: string): number {
    return this.getOrgSetting(orgId, 'MAX_ATTEMPTS', this.defaultSettings.MAX_ATTEMPTS);
  }

  /**
   * Get base retry delay for an organization
   * @param {string} orgId - Organization ID
   * @returns {number} Base retry delay in ms
   */
  getBaseRetryDelay(orgId: string): number {
    return this.getOrgSetting(orgId, 'DEFAULT_RETRY_DELAY', this.defaultSettings.DEFAULT_RETRY_DELAY);
  }

  /**
   * Get failure threshold for a group
   * @param {string} groupKey - Group key
   * @returns {number} Failure threshold
   */
  getFailureThreshold(groupKey: string): number {
    return this.getGroupSetting(groupKey, 'FAILURE_THRESHOLD', this.defaultSettings.FAILURE_THRESHOLD);
  }

  /**
   * Get cooldown duration for a group
   * @param {string} groupKey - Group key
   * @returns {number} Cooldown duration in ms
   */
  getCooldownDuration(groupKey: string): number {
    return this.getGroupSetting(
      groupKey, 
      'CATEGORY_COOLDOWN_PERIOD', 
      this.defaultSettings.DEFAULT_CATEGORY_COOLDOWN_PERIOD
    );
  }

  /**
   * Get max requests per group
   * @param {string} groupKey - Group key
   * @returns {number} Max requests per group
   */
  getMaxRequestsPerGroup(groupKey: string): number {
    return this.getGroupSetting(
      groupKey, 
      'MAX_REQUESTS_PER_GROUP', 
      this.defaultSettings.MAX_REQUESTS_PER_GROUP
    );
  }

  /**
   * Get global max concurrent requests
   * @returns {number} Global max concurrent requests
   */
  getGlobalMaxConcurrentRequests(): number {
    return this.defaultSettings.GLOBAL_MAX_CONCURRENT_REQUESTS;
  }

  /**
   * Get organization-specific setting
   * @param {string} orgId - Organization ID
   * @param {string} key - Setting key
   * @param {T} defaultValue - Default value
   * @returns {T} Setting value
   */
  getOrgSetting<T>(orgId: string, key: string, defaultValue: T): T {
    if (!orgId) return defaultValue;
    
    const orgConfig = this.orgSettings.get(orgId);
    if (!orgConfig) return defaultValue;
    
    return orgConfig[key] !== undefined ? orgConfig[key] as T : defaultValue;
  }

  /**
   * Get group-specific setting
   * @param {string} groupKey - Group key
   * @param {string} key - Setting key
   * @param {T} defaultValue - Default value
   * @returns {T} Setting value
   */
  getGroupSetting<T>(groupKey: string, key: string, defaultValue: T): T {
    if (!groupKey) return defaultValue;
    
    const groupConfig = this.groupSettings.get(groupKey);
    if (!groupConfig) return defaultValue;
    
    return groupConfig[key] !== undefined ? groupConfig[key] as T : defaultValue;
  }

  /**
   * Set organization-specific setting
   * @param {string} orgId - Organization ID
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   */
  setOrgSetting(orgId: string, key: string, value: any): void {
    if (!this.orgSettings.has(orgId)) {
      this.orgSettings.set(orgId, {});
    }
    
    this.orgSettings.get(orgId)![key] = value;
  }

  /**
   * Set group-specific setting
   * @param {string} groupKey - Group key
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   */
  setGroupSetting(groupKey: string, key: string, value: any): void {
    if (!this.groupSettings.has(groupKey)) {
      this.groupSettings.set(groupKey, {});
    }
    
    this.groupSettings.get(groupKey)![key] = value;
  }
}

// Export singleton instance
export const settings = new SettingsService(); 