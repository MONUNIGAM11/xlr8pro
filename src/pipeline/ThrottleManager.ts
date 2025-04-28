import { Request } from '../models/Request';
import { SettingsService } from '../services/SettingsService';

export class ThrottleManager {
  private currentCapacity: number;
  constructor(private settings: SettingsService) {
    this.currentCapacity = settings.get('MAX_CONCURRENT_REQUESTS') ?? 100;
  }

  canAcceptRequest(_request: Request): boolean {
    // TODO: Add real rate limiting logic
    return true;
  }
}
