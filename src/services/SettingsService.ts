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

  set(key: string, value: any): void {
    this.settings[key] = value;
  }
}

// Export singleton instance
export const settings = new SettingsService();
