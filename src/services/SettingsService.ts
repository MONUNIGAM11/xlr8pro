import { eventBus, MetricsEventType } from '../events/EventBus';

/**
 * Minimal settings/configuration service
 */
export class SettingsService {
  private settings: Record<string, any> = {
    HTTP_PORT: 3000,
    MAX_CONCURRENT_REQUESTS: 100,
    // Add more default settings as needed
  };

  get(key: string): any {
    return this.settings[key];
  }

  set(key: string, value: any, changedBy: string = 'system'): void {
    this.settings[key] = value;
    eventBus.publish({
      type: MetricsEventType.CONFIGURATION_CHANGED,
      payload: {
        changedBy,
        changes: { [key]: value }
      },
      timestamp: new Date()
    });
  }
}

// Export singleton instance
export const settings = new SettingsService();
