import { MetricsRepository, MetricDefinition } from '../interfaces/MetricsRepository';
import { MemoryMetricsStore } from '../storage/MemoryMetricsStore';
// import { MongoMetricsRepository } from '../storage/MongoMetricsRepository'; // Comment out or remove import
import { MetricsEventListener } from '../collection/MetricsEventListener';
import { getTimeframeMilliseconds } from '../utils/TimeUtils';
import { ConnectionMetrics, getMetricDefinition, TrafficMetrics } from '../definitions/MetricDefinitions';

// Define a placeholder type or interface if needed for type safety when mongoRepo is null
type MongoMetricsRepository = any;


/**
 * Main service that coordinates metrics collection, storage, and retrieval
 */
export class MetricsService implements MetricsRepository {
  private memoryStore: MemoryMetricsStore;
  private mongoRepo: MongoMetricsRepository | null; // Allow mongoRepo to be null
  private eventListener: MetricsEventListener;
  private flushInterval: NodeJS.Timeout | null = null; // Allow flushInterval to be null
  
  constructor(
    eventBus: any,
    mongoClient: any, // This will be null/undefined when not using MongoDB
    private options: {
      flushIntervalMs: number;
      timeSeriesCapacity: number;
    } = {
      flushIntervalMs: 60000, // Default: flush every minute
      timeSeriesCapacity: 1440 // Default: 24h at 1-min resolution
    }
  ) {
    // Initialize components
    this.memoryStore = new MemoryMetricsStore(options.timeSeriesCapacity);

    // Conditionally initialize mongoRepo
    if (mongoClient) {
      // Import dynamically or use require if needed, or ensure MongoMetricsRepository is available at runtime
      // For now, assuming mongoClient means the class is somehow available or we handle it differently
      // A simpler way for now is to cast or use 'any' if we know the file is there but not imported traditionally
      const { MongoMetricsRepository: MongoRepoClass } = require('../storage/MongoMetricsRepository.ts.disabled'); // Use require and the disabled name
      this.mongoRepo = new MongoRepoClass(mongoClient, 'xlr8plus_metrics', options);
      console.log('MongoDB metrics repository initialized.');

      // Set up periodic flush to MongoDB only if mongoClient is provided
      this.flushInterval = setInterval(
        () => this.flushToMongo(),
        options.flushIntervalMs
      );
    } else {
      this.mongoRepo = null;
      console.log('MongoDB metrics repository not initialized (mongoClient not provided).');
    }

    this.eventListener = new MetricsEventListener(eventBus, this);
  }
  recordHistogram(name: string, value: number, dimensions?: Record<string, string>): void {
    this.memoryStore.recordHistogram(name, value, dimensions);
  }
  getHistogramStats(name: string, dimensions?: Record<string, string>): { count: number; sum: number; min: number; max: number; avg: number; p50?: number; p90?: number; p95?: number; p99?: number; } {
    return this.memoryStore.getHistogramStats(name, dimensions);
  }
  
  /**
   * Flush in-memory metrics to MongoDB (only if mongoRepo is initialized)
   */
  private async flushToMongo(): Promise<void> {
    if (!this.mongoRepo) {
      return; // Do nothing if mongoRepo is not initialized
    }
    try {
      const batchData = this.memoryStore.prepareForBatch();
      if (batchData.length > 0) {
        await this.mongoRepo.batchWrite(batchData);
        console.log(`Flushed ${batchData.length} metrics to MongoDB`);
      }
    } catch (error) {
      console.error('Error flushing metrics to MongoDB:', error);
    }
  }
  
  // #region Enhanced Dimension-Aware Methods
  
  /**
   * Record a metric with dimension validation
   * @param metricDef The metric definition to validate against
   * @param value The value to record
   * @param dimensions The dimensions to use
   */
  recordMetric(metricDef: MetricDefinition, value: number, dimensions: Record<string, string>): void {
    this.memoryStore.recordMetric(metricDef, value, dimensions);
  }
  
  /**
   * Record a timing metric with dimension validation
   * @param metricDef The metric definition to validate against
   * @param durationMs The duration in milliseconds
   * @param dimensions The dimensions to use
   */
  recordTimingMetric(metricDef: MetricDefinition, durationMs: number, dimensions: Record<string, string>): void {
    this.memoryStore.recordTimingMetric(metricDef, durationMs, dimensions);
  }
  
  /**
   * Record a histogram metric with dimension validation
   * @param metricDef The metric definition to validate against
   * @param value The value to record
   * @param dimensions The dimensions to use
   */
  recordHistogramMetric(metricDef: MetricDefinition, value: number, dimensions: Record<string, string>): void {
    this.memoryStore.recordHistogramMetric(metricDef, value, dimensions);
  }
  
  /**
   * Record a gauge metric with dimension validation
   * @param metricDef The metric definition to validate against
   * @param value The value to record
   * @param dimensions The dimensions to use
   */
  recordGaugeMetric(metricDef: MetricDefinition, value: number, dimensions: Record<string, string>): void {
    this.memoryStore.recordGaugeMetric(metricDef, value, dimensions);
  }
  
  // #endregion

  /**
   * Clean up resources when shutting down
   */
  shutdown(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    // Perform final flush only if mongoRepo exists
    if (this.mongoRepo) {
      this.flushToMongo().catch(err =>
        console.error('Error during final metrics flush:', err)
      );
       // Assuming mongoRepo has a shutdown method
       if ('shutdown' in this.mongoRepo && typeof this.mongoRepo.shutdown === 'function') {
         (this.mongoRepo as any).shutdown();
       }
    }
     this.eventListener.unsubscribeAll(); // Unsubscribe event listeners on shutdown
  }
  
  // Implement MetricsRepository interface by delegating to memory store (and mongoRepo for historical)
  
  incrementCounter(name: string, value: number, dimensions?: Record<string, string>): void {
    this.memoryStore.incrementCounter(name, value, dimensions);
  }
  
  getCounter(name: string, dimensions?: Record<string, string>): number {
    return this.memoryStore.getCounter(name, dimensions);
  }
  
  recordGauge(name: string, value: number, dimensions?: Record<string, string>): void {
    this.memoryStore.recordGauge(name, value, dimensions);
  }
  
  getGauge(name: string, dimensions?: Record<string, string>): number {
    return this.memoryStore.getGauge(name, dimensions);
  }
  
  recordTiming(name: string, durationMs: number, dimensions?: Record<string, string>): void {
    this.memoryStore.recordTiming(name, durationMs, dimensions);
  }
  
  getTimingStats(name: string, dimensions?: Record<string, string>): { avg: number; min: number; max: number; p95?: number; p90?: number;  p99?: number; } {
    return this.memoryStore.getTimingStats(name, dimensions);
  }
  
  async getTimeSeries(name: string, dimensions: Record<string, string>, start: Date, end: Date): Promise<import('../interfaces/TimePoint').TimePoint[]> {
    const now = new Date();
    // Define recentThreshold based on memory store capacity or a fixed time (e.g., last 24 hours)
    // For now, let's assume the memory store holds recent data relevant to the query timeframe
    // In a real scenario with MongoDB, this threshold logic would be more sophisticated.
    // Since we are only using memory, we'll just query the memory store.

    // If mongoRepo exists, use the original logic to query both
    if (this.mongoRepo) {
       const recentThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Example threshold

       // For recent data, use memory store
       if (start >= recentThreshold) {
         return this.memoryStore.getTimeSeries(name, dimensions, start, end);
       }

       // For historical data, use MongoDB
       if (end < recentThreshold) {
         return this.mongoRepo.getTimeSeries(name, dimensions, start, end);
       }

       // For mixed timeframes, combine results
       const [historical, recent] = await Promise.all([
         this.mongoRepo.getTimeSeries(name, dimensions, start, recentThreshold),
         this.memoryStore.getTimeSeries(name, dimensions, recentThreshold, end)
       ]);

       return [...historical, ...recent];

    } else {
        // If no mongoRepo, always query the memory store
        return this.memoryStore.getTimeSeries(name, dimensions, start, end);
    }
  }
  

  
  // Methods that require persistence or more complex logic (can return empty/placeholder for now)
  async getRetryAnalysis(requestGroupKey: string, timeframe: string): Promise<any> {
     if (this.mongoRepo) {
        // Implement with mongoRepo
        return Promise.resolve({}); // Placeholder
     }
    return Promise.resolve({}); // Placeholder
  }
  async getGroupHealth(requestGroupKey: string): Promise<any> {
     if (this.mongoRepo) {
        // Implement with mongoRepo
        return Promise.resolve({}); // Placeholder
     }
    return Promise.resolve({}); // Placeholder
  }
  // Dashboard API methods
  async getSummaryMetrics(): Promise<Record<string, any>> {
    return this.memoryStore.getSummaryMetrics();
  }
  
  /**
   * Enhanced implementation for getGroupMetrics
   */
  async getGroupMetrics(): Promise<Record<string, any>> {
    const now = Date.now();
    const groups: any[] = [];
    
    // Extract unique group keys from counters
    const dimensionslist = await this.getUniqueDemension();
    
    // Process each group
    for (const dimensions of dimensionslist) {
      // const orgId = groupKey.split(':')[0];
      
      // Get basic counts
      const totalRequests = this.getCounter('request.received', dimensions );
      const successfulRequests = this.getCounter('request.completed', dimensions );
      const failedRequests = this.getCounter('request.failed',  dimensions );
      const retryAttempts = this.getCounter('retry.attempts', dimensions );
      const cooldownActivations = this.getCounter('cooldown.activated', dimensions );
      const maxRetryReached = this.getCounter('retry.max_reached', dimensions);
      
      // Calculate success rate
      const successRate = totalRequests > 0 
        ? (successfulRequests / totalRequests * 100).toFixed(2) + '%'
        : '0.00%';
      
      // Get response time stats
      const responseTimeStats = this.getTimingStats('request.response_time', dimensions );
      const avgResponseTime = `${Math.round(responseTimeStats.avg)}ms`;
      
      // Get current status
      const inCooldown = this.getGauge('throttle.cooldown_remaining', dimensions) > 0;
      const cooldownRemaining = Math.round(this.getGauge('throttle.cooldown_remaining',  dimensions ));
      const activeRequests = Math.round(this.getGauge('system.group_active_requests', dimensions ));
      
      // Get queue stats
      const queueLength = Math.round(this.getGauge('queue.length',  dimensions ));
      const queueDepth = Math.round(this.getGauge('queue.depth',  dimensions ));
      const queueDelayed = Math.round(this.getGauge('queue.delayed', dimensions));
      const queueWaitingRetry = Math.round(this.getGauge('queue.waiting_retry',  dimensions ));
      
      // Get throttling stats
      const totalThrottled = this.getCounter('throttle.rejected',  dimensions );
      
      // Get throttle reasons (if available)
      const reasonDistribution: Record<string, number> = {};
      const reasonMetrics = (this.memoryStore as any)?.counters?.get('throttle.rejected');
      
      if (reasonMetrics) {
        reasonMetrics.getAll()
          .filter((m: any) => m.dimensions.groupKey === dimensions && m.dimensions.reason)
          .forEach((m: any) => {
            const reason = m.dimensions.reason;
            reasonDistribution[reason] = (reasonDistribution[reason] || 0) + m.value;
          });
      }
      
      // Get User Agent Counts for this group
      const userAgentCounts: Record<string, number> = {};
      const userAgentMetric = (this.memoryStore as any)?.counters?.get(TrafficMetrics.USER_AGENT_TOTAL.name);
       if (userAgentMetric) {
         try {
            userAgentMetric.getAll()
              .filter((m: any) => m.dimensions.groupKey === dimensions && m.dimensions.userAgent)
              .forEach((m: any) => {
                const agent = m.dimensions.userAgent;
                userAgentCounts[agent] = (userAgentCounts[agent] || 0) + m.value;
              });
         } catch (error) {
             console.warn('Could not get user agent counts:', error);
         }
       }

       // Get Connection Reuse Count for this group
       const connectionReuseCount = this.getCounter(ConnectionMetrics.CONNECTION_REUSE_TOTAL.name, { groupKey: dimensions });
      
      // Add group data
      groups.push({
        key: dimensions,
        current: {
          success: Math.round(this.getCounter('request.completed', { groupKey: dimensions, timeframe: '5m' })),
          failure: Math.round(this.getCounter('request.failed', { groupKey: dimensions, timeframe: '5m' })),
          inCooldown,
          cooldownRemaining,
          activeRequests
        },
        aggregate: {
          total: totalRequests,
          success: successfulRequests,
          failure: failedRequests,
          retries: retryAttempts,
          cooldowns: cooldownActivations,
          maxRetryReached
        },
        successRate,
        responseTimeStats,
        avgResponseTime,
        queueDepth: {
          length: queueLength,
          accepted: queueDepth,
          delayed: queueDelayed,
          waitingRetry: queueWaitingRetry
        },
        throttling: {
          totalThrottled,
          reasonDistribution: Object.keys(reasonDistribution).length > 0 
            ? reasonDistribution 
            : { 'unknown': totalThrottled }
        },
        traffic: {
           userAgentCounts,
        },
        connection: {
            reused: connectionReuseCount,
        }
      });
    }
    
    // Add system-wide metrics (collected by MetricsStateCollector if available)
    const systemMetrics: Record<string, any> = {};
    try {
       // Assuming getSummaryMetrics includes system-wide gauges or we can access them directly
       // For now, let's try to get some known system gauges
       systemMetrics.inFlight = Math.round(this.getGauge('system.active_requests', {})); // System-wide 'inFlight'
       systemMetrics.cpuLoad1m = this.getGauge('system.cpu_load_1m', {}); // Example system metric
       systemMetrics.memoryUsed = this.getGauge('system.memory_used', {}); // Example system metric
       systemMetrics.queueLength = this.getGauge('queue.length', {}); // System-wide queue length

    } catch (error) {
        console.warn('Could not retrieve system metrics:', error);
    }

    return {
      timestamp: new Date(now).toISOString(),
      system: systemMetrics, // Include system metrics
      groups
    };
  }
  
  async getStatusMetrics(): Promise<Record<string, any>> {
    // This method needs implementation. It could return a summary of service statuses, circuit breaker states, etc.
    // For now, return a placeholder.
    return Promise.resolve({ status: 'ok', message: 'Status metrics endpoint not fully implemented yet.' });
  }
  
  async getHistoricalMetrics(timeframe: string, metricName?: string): Promise<Record<string, any>> {
    if (this.mongoRepo) {
        // Original implementation using mongoRepo
        const now = new Date();
        const end = now;
        const start = new Date(now.getTime() - getTimeframeMilliseconds(timeframe));

        if (metricName) {
            // Fetch specific metric data
            const timeSeriesData = await this.getTimeSeries(metricName, {}, start, end); // Assuming no dimensions for now
            return { [metricName]: timeSeriesData };
        } else {
            // Fetch all relevant historical metrics (needs more sophisticated logic)
            // This would typically involve querying for multiple metric time series
            return Promise.resolve({ message: 'Fetching all historical metrics is not yet fully implemented.' }); // Placeholder
        }
    } else {
        return Promise.resolve({ message: 'Historical metrics are not available with in-memory storage.' });
    }
  }

  /**
   * Get cooldown insights for a group or all groups
   * @param groupKey Optional group key to filter by
   * @param timeframe Time window for historical analysis
   */
  async getCooldownInsights(groupKey?: string, timeframe: string = '24h'): Promise<Record<string, any>> {
    if (this.mongoRepo) {
        // Original implementation using mongoRepo
        // This method likely needs access to historical data to provide insights
        const now = new Date();
        const end = now;
        const start = new Date(now.getTime() - getTimeframeMilliseconds(timeframe));
        // Implementation needs to query historical metrics related to cooldowns
        return Promise.resolve({ message: 'Cooldown insights require historical data and are not fully implemented with in-memory store.' }); // Placeholder
    } else {
        return Promise.resolve({ message: 'Cooldown insights require historical data and are not available with in-memory storage.' });
    }
  }

  /**
   * Get active cooldown groups
   * @private
   */
  private getActiveCooldownGroups(): string[] {
    // This would ideally come from a dedicated cooldown service
    // For now, we'll just infer from available metrics
    
    // If we have a specific metric for active cooldown groups, use that
    const cooldownGroupsMetric = this.getCounter('cooldown.activated') || 0;
    
    // Or get from dimensional metrics
    const cooldownMetrics = (this.memoryStore as any)?.counters?.get('cooldown.activated');
    
    if (cooldownMetrics) {
      return cooldownMetrics.getAll()
        .filter(metric => metric.value > 0)
        .map(metric => metric.dimensions.groupKey);
    }
    
    // Default to empty array if we can't find any
    return [];
  }

  /**
   * Get cooldown reason for a group
   * @private
   */
  private getCooldownReason(groupKey: string): string {
    // Try to get most recent reason from dimensional metrics
    const reasonMetrics = (this.memoryStore as any)?.counters?.get('cooldown.activated');
    
    if (reasonMetrics) {
      const metrics = reasonMetrics.getAll()
        .filter(metric => metric.dimensions.groupKey === groupKey);
      
      if (metrics.length > 0) {
        // Find the one with the most recent timestamp
        const sorted = [...metrics].sort((a, b) => b.timestamp - a.timestamp);
        return sorted[0].dimensions.reason || 'unknown';
      }
    }
    
    return 'unknown';
  }

  /**
   * Get recent errors for a group
   * @private
   */
  private async getRecentErrors(groupKey: string, timeframe: string): Promise<any[]> {
    if (this.mongoRepo) {
        // Original implementation using mongoRepo
        const now = new Date();
        const end = now;
        const start = new Date(now.getTime() - getTimeframeMilliseconds(timeframe));
        // Query historical errors from MongoDB
        return Promise.resolve([]); // Placeholder
    } else {
        console.warn('Cannot get recent errors: MongoDB not initialized.');
        return Promise.resolve([]); // Return empty array if no mongoRepo
    }
  }

  /**
   * Get historical cooldown insights
   * @private
   */
  private async getHistoricalCooldownInsights(
    groupKey: string | undefined, 
    start: Date, 
    end: Date
  ): Promise<any> {
    // Query for cooldown activations
    const dimensions: Record<string, string> = {};
    if (groupKey) {
      dimensions.groupKey = groupKey;
    }
    
    const results = await this.queryDimensionalMetrics(
      ['cooldown.activated', 'cooldown.duration'],
      dimensions,
      start,
      end,
      'sum'
    );
    
    // Extract most frequent groups
    const activationsByGroup: Record<string, number> = {};
    const reasonDistribution: Record<string, number> = {};
    const durationStats: { durations: number[], byGroup: Record<string, number[]> } = {
      durations: [],
      byGroup: {}
    };
    
    // Process results
    results.forEach(result => {
      if (result.metric === 'cooldown.activated' && result.dimensions.groupKey) {
        // Count activations by group
        const groupKey = result.dimensions.groupKey;
        activationsByGroup[groupKey] = (activationsByGroup[groupKey] || 0) + result.value;
        
        // Count by reason
        const reason = result.dimensions.reason || 'unknown';
        reasonDistribution[reason] = (reasonDistribution[reason] || 0) + result.value;
      }
      
      if (result.metric === 'cooldown.duration' && result.dimensions.groupKey) {
        // Collect durations for stats
        const groupKey = result.dimensions.groupKey;
        durationStats.durations.push(result.value);
        
        if (!durationStats.byGroup[groupKey]) {
          durationStats.byGroup[groupKey] = [];
        }
        durationStats.byGroup[groupKey].push(result.value);
      }
    });
    
    // Sort groups by cooldown count
    const mostFrequentGroups = Object.entries(activationsByGroup)
      .map(([groupKey, cooldownCount]) => ({ groupKey, cooldownCount }))
      .sort((a, b) => b.cooldownCount - a.cooldownCount)
      .slice(0, 5);
    
    // Calculate duration statistics
    const durations = durationStats.durations;
    const durationMetrics = durations.length > 0 ? {
      avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      p95Duration: durations.length >= 20 ? 
        this.calculatePercentile(durations, 95) : undefined
    } : {
      avgDuration: 0,
      minDuration: 0,
      maxDuration: 0
    };
    
    // Calculate time distribution (hourly pattern)
    const timeDistribution = await this.calculateTimeDistribution(
      'cooldown.activated',
      dimensions,
      start,
      end
    );
    
    return {
      mostFrequentGroups,
      primaryReasons: reasonDistribution,
      timeDistribution,
      durationStats: durationMetrics
    };
  }

  /**
   * Calculate percentile of an array of numbers
   * @private
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
  }

  /**
   * Calculate time distribution patterns
   * @private
   */
  private async calculateTimeDistribution(
    metricName: string,
    dimensions: Record<string, string>,
    start: Date,
    end: Date
  ): Promise<any> {
    // This method likely needs historical data for accurate distribution analysis
    if (this.mongoRepo) {
         // Original implementation using mongoRepo
         // ... fetch historical data and calculate distribution ...
         return Promise.resolve({}); // Placeholder
    } else {
        console.warn('Cannot calculate time distribution: MongoDB not initialized.');
        return Promise.resolve({}); // Placeholder
    }
  }

  /**
   * Generate recommendations based on cooldown patterns
   * @private
   */
  private generateCooldownRecommendations(historicalInsights: any): any[] {
    // This method depends on historical insights, which depend on mongoRepo
     if (this.mongoRepo) {
         // Original implementation
         return []; // Placeholder
     } else {
         return []; // Return empty if no mongoRepo
     }
  }

  /**
   * Query metrics with dimensions
   */
  async queryDimensionalMetrics(
    metricNames: string[],
    dimensions: Record<string, string>,
    start: Date,
    end: Date,
    aggregation: string = 'avg'
  ): Promise<Array<{
    metric: string;
    dimensions: Record<string, string>;
    value: number;
    sampleCount: number;
  }>> {
    // This method is flexible and can potentially query memory or mongo
    // Given our current focus on in-memory, we'll delegate to memory store for now
    // In a full implementation, this would smartly query memory for recent and mongo for historical
    return this.memoryStore.queryDimensionalMetrics(metricNames, dimensions, start, end, aggregation);
  }

  /**
   * Get unique group keys from available metrics
   * @private
   */
  private getUniqueDemension(): any {
    // This method gets unique group keys from the in-memory store, which is fine
    return this.memoryStore.getUniqueDimensions();
  }
} 