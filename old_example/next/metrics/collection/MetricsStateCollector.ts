/**
 * Periodically collects system state metrics
 */
import { MetricsRepository } from '../interfaces/MetricsRepository';
import { 
  SystemMetrics, 
  QueueMetrics, 
  ThrottleMetrics,
  DimensionKey
} from '../definitions/MetricDefinitions';
import os from 'os';

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
    private metricsRepository: MetricsRepository,
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
      this.metricsRepository.recordGauge(SystemMetrics.ACTIVE_GROUPS.name, activeGroupCount);
      
      // Record per-group metrics
      const activeGroups = groupService.getActiveGroups();
      
      for (const groupKey of activeGroups) {
        // Extract organization ID if present in the group key
        const orgId = groupKey.split(':')[0];
        
        // Record active requests for this group
        const activeRequests = groupService.getActiveGroupRequests(groupKey);
        this.metricsRepository.recordGauge(SystemMetrics.GROUP_ACTIVE_REQUESTS.name, activeRequests, {
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
    this.metricsRepository.recordGauge(SystemMetrics.CPU_LOAD_1M.name, loadAvg[0]);
    this.metricsRepository.recordGauge(SystemMetrics.CPU_LOAD_5M.name, loadAvg[1]);
    this.metricsRepository.recordGauge(SystemMetrics.CPU_LOAD_15M.name, loadAvg[2]);
    
    // Memory usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    this.metricsRepository.recordGauge(SystemMetrics.MEMORY_TOTAL.name, totalMem);
    this.metricsRepository.recordGauge(SystemMetrics.MEMORY_FREE.name, freeMem);
    this.metricsRepository.recordGauge(SystemMetrics.MEMORY_USED.name, usedMem);
    this.metricsRepository.recordGauge(SystemMetrics.MEMORY_USAGE_PCT.name, (usedMem / totalMem) * 100);
    
    // Process memory usage (resident set size)
    if (process.memoryUsage) {
      const { rss, heapTotal, heapUsed } = process.memoryUsage();
      this.metricsRepository.recordGauge(SystemMetrics.PROCESS_MEMORY_RSS.name, rss);
      this.metricsRepository.recordGauge(SystemMetrics.PROCESS_MEMORY_HEAP_TOTAL.name, heapTotal);
      this.metricsRepository.recordGauge(SystemMetrics.PROCESS_MEMORY_HEAP_USED.name, heapUsed);
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
    
    this.metricsRepository.recordGauge(SystemMetrics.MAX_CAPACITY.name, maxCapacity);
    this.metricsRepository.recordGauge(SystemMetrics.CAPACITY.name, currentCapacity);
    this.metricsRepository.recordGauge(SystemMetrics.ACTIVE_REQUESTS.name, activeRequests);
    
    // Calculate capacity utilization percentage
    if (maxCapacity > 0) {
      const utilizationPct = (currentCapacity / maxCapacity) * 100;
      this.metricsRepository.recordGauge(SystemMetrics.CAPACITY_UTILIZATION.name, utilizationPct);
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
    
    this.metricsRepository.recordGauge(QueueMetrics.QUEUE_LENGTH.name, queueLength);
    this.metricsRepository.recordGauge(QueueMetrics.QUEUE_CAPACITY.name, queueCapacity);
    this.metricsRepository.recordGauge(QueueMetrics.QUEUE_UTILIZATION.name, queueUtilization * 100);
  }
  
  /**
   * Collect cooldown-related metrics
   */
  private collectCooldownMetrics(): void {
    const cooldownService = this.services?.cooldownService;
    if (!cooldownService) return;
    
    const cooldownCount = cooldownService.getCooldownGroupCount();
    this.metricsRepository.recordGauge(SystemMetrics.COOLDOWN_GROUPS.name, cooldownCount);
    
    // Record per-group cooldown metrics
    const cooldownGroups = cooldownService.getCooldownGroupKeys();
    
    for (const groupKey of cooldownGroups) {
      // Extract organization ID if present in the group key
      const orgId = groupKey.split(':')[0];
      
      // Record cooldown reason
      const reason = cooldownService.getGroupCooldownReason(groupKey) || 'unknown';
      
      // Record cooldown remaining time
      const remainingMs = cooldownService.getGroupCooldownRemaining(groupKey);
      
      this.metricsRepository.recordGauge(ThrottleMetrics.COOLDOWN_REMAINING.name, remainingMs, {
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