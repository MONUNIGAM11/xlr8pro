/**
 * Periodically collects system state metrics
 */
import { MetricsRepository } from '../interfaces/MetricsRepository';
import { 
  SystemMetrics, 
  QueueMetrics, 
  ThrottleMetrics,
  DimensionKey,
  MetricType
} from '../definitions/MetricDefinitions';
import { MetricValidator, MetricDefinition } from '../utils/MetricValidator';
import os from 'os';
import { MemoryMetricsStore } from '../storage/MemoryMetricsStore';

/**
 * Service interface for capacity information
 */
interface CapacityService {
  getCurrentCapacity(): number;
  getMaxCapacity(): number;
  getActiveRequestCount(): number;
}

/**
 * Service interface for queue information
 */
interface QueueService {
  getQueueLength(): number;
  getQueueCapacity(): number;
  getQueueUtilization(): number;
}

/**
 * Service interface for cooldown group information
 */
interface CooldownService {
  getCooldownGroupCount(): number;
  getCooldownGroupKeys(): string[];
  getGroupCooldownReason(groupKey: string): string | undefined;
  getGroupCooldownRemaining(groupKey: string): number;
}

/**
 * Service interface for system groups information
 */
interface GroupService {
  getActiveGroupCount(): number;
  getActiveGroups(): string[];
  getActiveGroupRequests(groupKey: string): number;
}

export class MetricsStateCollector {
  private systemIntervalId: NodeJS.Timeout | null = null;
  private groupsIntervalId: NodeJS.Timeout | null = null;
  
  constructor(
    private metricsRepository: MemoryMetricsStore,
    private options: {
      systemIntervalMs?: number;
      groupsIntervalMs?: number;
    } = {},
    private services?: {
      capacityService?: CapacityService;
      queueService?: QueueService;
      cooldownService?: CooldownService;
      groupService?: GroupService;
    }
  ) {}
  
  // #region Helper Methods for Dimension-Aware Recording
  
  /**
   * Record a gauge metric with dimension validation
   */
  private recordGauge(metricDef: any, value: number, dimensions: Record<string, string> = {}): void {
    MetricValidator.safeRecord(metricDef, dimensions, (sanitizedDimensions) => {
      switch (metricDef.type) {
        case MetricType.GAUGE:
          if (this.metricsRepository.recordGaugeMetric) {
            this.metricsRepository.recordGaugeMetric(metricDef, value, sanitizedDimensions);
          } else {
            this.metricsRepository.recordGauge(metricDef.name, value, sanitizedDimensions);
          }
          break;
        default:
          console.warn(`Trying to record gauge for non-gauge metric: ${metricDef.name} (${metricDef.type})`);
          this.metricsRepository.recordGauge(metricDef.name, value, sanitizedDimensions);
      }
    });
  }
  
  // #endregion
  
  /**
   * Start collecting metrics at regular intervals
   */
  start(): void {
    // Collect immediately on start
    this.collectSystemMetrics();
    this.collectGroupMetrics();
    
    // Set up intervals for regular collection
    const systemInterval = this.options.systemIntervalMs || 15000; // Default: 15 seconds
    const groupsInterval = this.options.groupsIntervalMs || 30000; // Default: 30 seconds
    
    this.systemIntervalId = setInterval(() => this.collectSystemMetrics(), systemInterval);
    this.groupsIntervalId = setInterval(() => this.collectGroupMetrics(), groupsInterval);
    
    console.log(`Metrics collection started: system every ${systemInterval}ms, groups every ${groupsInterval}ms`);
  }
  
  /**
   * Stop collecting metrics
   */
  stop(): void {
    if (this.systemIntervalId) {
      clearInterval(this.systemIntervalId);
      this.systemIntervalId = null;
    }
    
    if (this.groupsIntervalId) {
      clearInterval(this.groupsIntervalId);
      this.groupsIntervalId = null;
    }
    
    console.log('Metrics collection stopped');
  }
  
  /**
   * Collect system-level metrics
   */
  private collectSystemMetrics(): void {
    try {
      // Record OS metrics
      this.collectOsMetrics();
      
      // Record system capacity metrics
      this.collectCapacityMetrics();
      
      // Record queue metrics
      this.collectQueueMetrics();
      
      // Record cooldown metrics
      this.collectCooldownMetrics();
      
    } catch (error) {
      console.error('Error collecting system metrics:', error);
    }
  }
  
  /**
   * Collect metrics about active groups
   */
  private collectGroupMetrics(): void {
    try {
      const groupService = this.services?.groupService;
      if (!groupService) return;
      
      // Record active group count
      const activeGroupCount = groupService.getActiveGroupCount();
      this.recordGauge(SystemMetrics.ACTIVE_GROUPS, activeGroupCount, {});
      
      // Record per-group metrics
      const activeGroups = groupService.getActiveGroups();
      
      for (const groupKey of activeGroups) {
        // Extract organization ID if present in the group key
        const orgId = groupKey.split(':')[0];
        
        // Record active requests for this group
        const activeRequests = groupService.getActiveGroupRequests(groupKey);
        this.recordGauge(SystemMetrics.GROUP_ACTIVE_REQUESTS, activeRequests, {
          [DimensionKey.GROUP_KEY]: groupKey,
          [DimensionKey.ORG_ID]: orgId
        });
      }
      
    } catch (error) {
      console.error('Error collecting group metrics:', error);
    }
  }
  
  /**
   * Collect OS-level metrics
   */
  private collectOsMetrics(): void {
    // CPU load average (1, 5, 15 minute averages)
    const loadAvg = os.loadavg();
    this.recordGauge(SystemMetrics.CPU_LOAD_1M, loadAvg[0], {});
    this.recordGauge(SystemMetrics.CPU_LOAD_5M, loadAvg[1], {});
    this.recordGauge(SystemMetrics.CPU_LOAD_15M, loadAvg[2], {});
    
    // Memory usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    this.recordGauge(SystemMetrics.MEMORY_TOTAL, totalMem, {});
    this.recordGauge(SystemMetrics.MEMORY_FREE, freeMem, {});
    this.recordGauge(SystemMetrics.MEMORY_USED, usedMem, {});
    this.recordGauge(SystemMetrics.MEMORY_USAGE_PCT, (usedMem / totalMem) * 100, {});
    
    // Process memory usage (resident set size)
    if (process.memoryUsage) {
      const { rss, heapTotal, heapUsed } = process.memoryUsage();
      this.recordGauge(SystemMetrics.PROCESS_MEMORY_RSS, rss, {});
      this.recordGauge(SystemMetrics.PROCESS_MEMORY_HEAP_TOTAL, heapTotal, {});
      this.recordGauge(SystemMetrics.PROCESS_MEMORY_HEAP_USED, heapUsed, {});
    }
  }
  
  /**
   * Collect capacity-related metrics
   */
  private collectCapacityMetrics(): void {
    const capacityService = this.services?.capacityService;
    if (!capacityService) return;
    
    const maxCapacity = capacityService.getMaxCapacity();
    const currentCapacity = capacityService.getCurrentCapacity();
    const activeRequests = capacityService.getActiveRequestCount();
    
    this.recordGauge(SystemMetrics.MAX_CAPACITY, maxCapacity, {});
    this.recordGauge(SystemMetrics.CAPACITY, currentCapacity, {});
    this.recordGauge(SystemMetrics.ACTIVE_REQUESTS, activeRequests, {});
    
    // Calculate capacity utilization percentage
    if (maxCapacity > 0) {
      const utilizationPct = (currentCapacity / maxCapacity) * 100;
      this.recordGauge(SystemMetrics.CAPACITY_UTILIZATION, utilizationPct, {});
    }
  }
  
  /**
   * Collect queue-related metrics
   */
  private collectQueueMetrics(): void {
    const queueService = this.services?.queueService;
    if (!queueService) return;
    
    const queueLength = queueService.getQueueLength();
    const queueCapacity = queueService.getQueueCapacity();
    const queueUtilization = queueService.getQueueUtilization();
    
    this.recordGauge(QueueMetrics.QUEUE_LENGTH, queueLength, {});
    this.recordGauge(QueueMetrics.QUEUE_CAPACITY, queueCapacity, {});
    this.recordGauge(QueueMetrics.QUEUE_UTILIZATION, queueUtilization * 100, {});
  }
  
  /**
   * Collect cooldown-related metrics
   */
  private collectCooldownMetrics(): void {
    const cooldownService = this.services?.cooldownService;
    if (!cooldownService) return;
    
    const cooldownCount = cooldownService.getCooldownGroupCount();
    this.recordGauge(SystemMetrics.COOLDOWN_GROUPS, cooldownCount, {});
    
    // Record per-group cooldown metrics
    const cooldownGroups = cooldownService.getCooldownGroupKeys();
    
    for (const groupKey of cooldownGroups) {
      // Extract organization ID if present in the group key
      const orgId = groupKey.split(':')[0];
      
      // Record cooldown reason
      const reason = cooldownService.getGroupCooldownReason(groupKey) || 'unknown';
      
      // Record cooldown remaining time
      const remainingMs = cooldownService.getGroupCooldownRemaining(groupKey);
      
      this.recordGauge(ThrottleMetrics.COOLDOWN_REMAINING, remainingMs, {
        [DimensionKey.GROUP_KEY]: groupKey,
        [DimensionKey.ORG_ID]: orgId,
        [DimensionKey.COOLDOWN_REASON]: reason
      });
    }
  }
  
  /**
   * Manually trigger metrics collection
   */
  collectNow(): void {
    this.collectSystemMetrics();
    this.collectGroupMetrics();
  }
} 