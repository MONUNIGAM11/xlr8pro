import os from 'os';
import { Request } from '../models/Request.js';
import { eventBus, EventType } from '../events/EventBus.js';
import { SettingsService } from './SettingsService.js';

/**
 * Dependencies for ThrottleManager
 */
export interface ThrottleManagerDependencies {
  requestRepository: {
    getActiveRequestCountForGroup(groupKey: string): number;
    getTotalActiveRequestCount(): number;
  };
  groupRepository: {
    isInCooldown(groupKey: string): boolean;
    getRemainingCooldownMs(groupKey: string): number;
  };
  settings: SettingsService;
}

/**
 * Reasons for throttle check
 */
export enum ThrottleReason {
  GROUP_COOLDOWN_BUT_ALLOWED = 'GROUP_COOLDOWN_BUT_ALLOWED',
  GROUP_LIMIT_EXCEEDED_BUT_ALLOWED = 'GROUP_LIMIT_EXCEEDED_BUT_ALLOWED',
  GROUP_LIMIT_SEVERELY_EXCEEDED = 'GROUP_LIMIT_SEVERELY_EXCEEDED',
  GLOBAL_COOLDOWN_BUT_ALLOWED = 'GLOBAL_COOLDOWN_BUT_ALLOWED',
  GLOBAL_CAPACITY_EXCEEDED_BUT_ALLOWED = 'GLOBAL_CAPACITY_EXCEEDED_BUT_ALLOWED',
  GLOBAL_CAPACITY_SEVERELY_EXCEEDED = 'GLOBAL_CAPACITY_SEVERELY_EXCEEDED'
}

/**
 * Result of throttle check
 */
export interface ThrottleResult {
  accepted: boolean;
  reason?: ThrottleReason;
  delayExecution?: boolean;
  delayMs?: number;
}

/**
 * Manager for throttling and rate limiting requests
 */
export class ThrottleManager {
  private requestRepository: ThrottleManagerDependencies['requestRepository'];
  private groupRepository: ThrottleManagerDependencies['groupRepository'];
  private settings: ThrottleManagerDependencies['settings'];
  
  // Dynamic capacity tracking
  private lastCapacityCheck: number = Date.now();
  private capacityCheckInterval: number = 10000; // 10 seconds
  private currentCapacity: number;
  private systemLoad: number = 0;
  private capacityUpdateTimer: NodeJS.Timeout | null = null;

  /**
   * Create a new ThrottleManager
   * @param {ThrottleManagerDependencies} dependencies - Dependencies
   */
  constructor(dependencies: ThrottleManagerDependencies) {
    this.requestRepository = dependencies.requestRepository;
    this.groupRepository = dependencies.groupRepository;
    this.settings = dependencies.settings;
    
    // Initialize with default capacity
    this.currentCapacity = this.settings.getGlobalMaxConcurrentRequests();
    
    // Periodically update capacity
    this.capacityUpdateTimer = setInterval(
      () => this.updateSystemCapacity(), 
      this.capacityCheckInterval
    );
    
    // Register for shutdown events
    eventBus.subscribe(EventType.SHUTDOWN_INITIATED, () => {
      if (this.capacityUpdateTimer) {
        clearInterval(this.capacityUpdateTimer);
        this.capacityUpdateTimer = null;
      }
    });
    
    console.log('Throttle manager initialized');
  }

  /**
   * Check if a request can be accepted
   * @param {Request} request - Request to check
   * @returns {ThrottleResult} Whether the request can be accepted
   */
  canAcceptRequest(request: Request): ThrottleResult {
    const { groupKey } = request;
    
    // Check if group is in cooldown
    if (this.groupRepository.isInCooldown(groupKey)) {
      // Still track but allow the request, with a warning
      console.warn(`ThrottleManager: Group ${groupKey} is in cooldown - allowing anyway`);
      const delayMs = this.groupRepository.getRemainingCooldownMs(groupKey);
      return { accepted: true, reason: ThrottleReason.GROUP_COOLDOWN_BUT_ALLOWED, delayExecution: true, delayMs: delayMs };
    }
    
    // Check group-specific limit
    const groupLimit = this.settings.getMaxRequestsPerGroup(groupKey);
    const groupCurrentCount = this.requestRepository.getActiveRequestCountForGroup(groupKey);
    
    if (groupCurrentCount >= groupLimit) {
      // Allow if under 150% capacity
      const overloadLimit = Math.floor(groupLimit * 1.5);
      if (groupCurrentCount < overloadLimit) {
        console.warn(`ThrottleManager: Group ${groupKey} exceeding limit (${groupCurrentCount}/${groupLimit}) - allowing anyway`);
        let delayMs = this.groupRepository.getRemainingCooldownMs(groupKey);
        if (delayMs === 0) {
          delayMs = 1000;
        }
        return { accepted: true, reason: ThrottleReason.GROUP_LIMIT_EXCEEDED_BUT_ALLOWED, delayExecution: true, delayMs: delayMs };
      }
      else {
        return { accepted: false, reason: ThrottleReason.GROUP_LIMIT_SEVERELY_EXCEEDED, delayExecution: false, delayMs: 0 };
      }
    }
    
    // Check global capacity
    const totalRequests = this.requestRepository.getTotalActiveRequestCount();
    const overloadCapacity = Math.floor(this.currentCapacity * 1.5);
    
    if (totalRequests >= this.currentCapacity) {
      if (totalRequests < overloadCapacity) {
        console.warn(`ThrottleManager: System exceeding capacity (${totalRequests}/${this.currentCapacity}) - allowing anyway`);
        return { accepted: true, reason: ThrottleReason.GLOBAL_CAPACITY_EXCEEDED_BUT_ALLOWED };
      } else {
        return { accepted: false, reason: ThrottleReason.GLOBAL_CAPACITY_SEVERELY_EXCEEDED };
      }
    }
    
    return { accepted: true };
  }

  /**
   * Update system capacity based on resource usage
   */
  private updateSystemCapacity(): void {
    try {
      // Calculate system load
      const loadAvg = os.loadavg()[0];
      const cpuCount = os.cpus().length;
      const relativeLoad = loadAvg / cpuCount;
      
      // Get memory usage
      const freeMem = os.freemem();
      const totalMem = os.totalmem();
      const memoryUsageRatio = 1 - (freeMem / totalMem);
      
      // Combine factors (simplified)
      this.systemLoad = Math.max(relativeLoad, memoryUsageRatio);
      
      // Adjust capacity based on load
      // We reduce capacity as system load increases, but less aggressively
      const baseCapacity = this.settings.getGlobalMaxConcurrentRequests();
      const minCapacity = baseCapacity * 0.5; // Increase minimum to 50% (was 20%)
      const oldCapacity = this.currentCapacity;
      
      if (this.systemLoad > 0.9) { // Only reduce at very high load (was 0.8)
        // High load, reduce capacity 
        this.currentCapacity = Math.max(minCapacity, baseCapacity * (1 - (this.systemLoad - 0.5)));
      } else if (this.systemLoad > 0.7) { // Was 0.5
        // Moderate load, reduce capacity slightly
        this.currentCapacity = baseCapacity * (1 - (this.systemLoad - 0.7) * 0.5);
      } else {
        // Low load, use full capacity
        this.currentCapacity = baseCapacity;
      }
      
      // Log capacity changes for diagnostics
      if (this.currentCapacity !== oldCapacity) {
        // console.log(`Capacity updated: ${oldCapacity} → ${this.currentCapacity} (load: CPU=${relativeLoad.toFixed(2)}, Mem=${memoryUsageRatio.toFixed(2)}, Combined=${this.systemLoad.toFixed(2)})`);
      }
      
      // Emit capacity update event
      eventBus.publish({
        type: EventType.CAPACITY_UPDATED,
        payload: {
          capacity: this.currentCapacity,
          systemLoad: this.systemLoad,
          memoryUsage: memoryUsageRatio,
          cpuLoad: relativeLoad
        },
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error updating system capacity:', error);
      // Fallback to default capacity
      this.currentCapacity = this.settings.getGlobalMaxConcurrentRequests();
    }
  }

  /**
   * Get current system capacity
   * @returns {number} Current capacity
   */
  getCurrentCapacity(): number {
    return this.currentCapacity;
  }

  /**
   * Get current system load
   * @returns {number} System load (0-1)
   */
  getSystemLoad(): number {
    return this.systemLoad;
  }
} 