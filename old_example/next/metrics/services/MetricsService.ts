import { MetricsRepository } from '../interfaces/MetricsRepository';
import { MemoryMetricsStore } from '../storage/MemoryMetricsStore';
import { MongoMetricsRepository } from '../storage/MongoMetricsRepository';
import { MetricsEventListener } from '../collection/MetricsEventListener';
import { getTimeframeMilliseconds } from '../utils/TimeUtils';
import { getMetricDefinition } from '../definitions/MetricDefinitions';


/**
 * Main service that coordinates metrics collection, storage, and retrieval
 */
export class MetricsService implements MetricsRepository {
  private memoryStore: MemoryMetricsStore;
  private mongoRepo: MongoMetricsRepository;
  private eventListener: MetricsEventListener;
  private flushInterval: NodeJS.Timeout;
  
  constructor(
    eventBus: any,
    mongoClient: any,
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
    this.mongoRepo = new MongoMetricsRepository(mongoClient, 'xlr8plus_metrics', options);
    this.eventListener = new MetricsEventListener(eventBus, this);
    
    // Set up periodic flush to MongoDB
    this.flushInterval = setInterval(
      () => this.flushToMongo(), 
      options.flushIntervalMs
    );
  }
  recordHistogram(name: string, value: number, dimensions?: Record<string, string>): void {
    this.memoryStore.recordHistogram(name, value, dimensions);
  }
  getHistogramStats(name: string, dimensions?: Record<string, string>): { count: number; sum: number; min: number; max: number; avg: number; p50?: number; p90?: number; p95?: number; p99?: number; } {
    return this.memoryStore.getHistogramStats(name, dimensions);
  }
  
  /**
   * Flush in-memory metrics to MongoDB
   */
  private async flushToMongo(): Promise<void> {
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
  
  /**
   * Clean up resources when shutting down
   */
  shutdown(): void {
    clearInterval(this.flushInterval);
    // Perform final flush
    this.flushToMongo().catch(err => 
      console.error('Error during final metrics flush:', err)
    );
  }
  
  // Implement MetricsRepository interface by delegating to memory store
  
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
  
  getTimingStats(name: string, dimensions?: Record<string, string>): { avg: number; min: number; max: number; p95?: number; p99?: number; } {
    return this.memoryStore.getTimingStats(name, dimensions);
  }
  
  async getTimeSeries(name: string, dimensions: Record<string, string>, start: Date, end: Date): Promise<import('../interfaces/TimePoint').TimePoint[]> {
    const now = new Date();
    const recentThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours
    
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
  }
  
  // Legacy compatibility methods
  recordRequestStart(requestId: string, requestGroupKey: string): void {
    this.memoryStore.recordRequestStart(requestId, requestGroupKey);
  }
  
  recordRequestCompletion(requestId: string, statusCode: number): void {
    this.memoryStore.recordRequestCompletion(requestId, statusCode);
  }
  
  recordRetryAttempt(requestId: string, requestGroupKey: string, attemptNumber: number): void {
    this.memoryStore.recordRetryAttempt(requestId, requestGroupKey, attemptNumber);
  }
  
  recordCooldownActivation(requestGroupKey: string, duration: number, reason?: string): void {
    this.memoryStore.recordCooldownActivation(requestGroupKey, duration, reason);
  }
  
  getRetryAnalysis(requestGroupKey: string, timeframe: string): Promise<any> {
    // Implementation needed
    return Promise.resolve({});
  }
  getGroupHealth(requestGroupKey: string): Promise<any> {
    // Implementation needed
    return Promise.resolve({});
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
    const groupKeys = this.getUniqueGroupKeys();
    
    // Process each group
    for (const groupKey of groupKeys) {
      const orgId = groupKey.split(':')[0];
      
      // Get basic counts
      const totalRequests = this.getCounter('request.received', { groupKey });
      const successfulRequests = this.getCounter('request.completed', { groupKey });
      const failedRequests = this.getCounter('request.failed', { groupKey });
      const retryAttempts = this.getCounter('retry.attempts', { groupKey });
      const cooldownActivations = this.getCounter('cooldown.activated', { groupKey });
      const maxRetryReached = this.getCounter('retry.max_reached', { groupKey });
      
      // Calculate success rate
      const successRate = totalRequests > 0 
        ? (successfulRequests / totalRequests * 100).toFixed(2) + '%'
        : '0.00%';
      
      // Get response time stats
      const responseTimeStats = this.getTimingStats('request.response_time', { groupKey });
      const avgResponseTime = `${Math.round(responseTimeStats.avg)}ms`;
      
      // Get current status
      const inCooldown = this.getGauge('throttle.cooldown_remaining', { groupKey }) > 0;
      const cooldownRemaining = Math.round(this.getGauge('throttle.cooldown_remaining', { groupKey }));
      const activeRequests = Math.round(this.getGauge('system.group_active_requests', { groupKey }));
      
      // Get queue stats
      const queueAccepted = Math.round(this.getGauge('queue.depth', { groupKey }));
      const queueDelayed = Math.round(this.getGauge('queue.delayed', { groupKey }));
      const queueWaitingRetry = Math.round(this.getGauge('queue.waiting_retry', { groupKey }));
      
      // Get throttling stats
      const totalThrottled = this.getCounter('throttle.rejected', { groupKey });
      
      // Get throttle reasons (if available)
      const reasonDistribution: Record<string, number> = {};
      const reasonMetrics = (this.memoryStore as any)?.counters?.get('throttle.rejected');
      
      if (reasonMetrics) {
        reasonMetrics.getAll()
          .filter((m: any) => m.dimensions.groupKey === groupKey && m.dimensions.reason)
          .forEach((m: any) => {
            const reason = m.dimensions.reason;
            reasonDistribution[reason] = (reasonDistribution[reason] || 0) + m.value;
          });
      }
      
      // Add group data
      groups.push({
        key: groupKey,
        current: {
          success: Math.round(this.getCounter('request.completed', { groupKey, timeframe: '5m' })),
          failure: Math.round(this.getCounter('request.failed', { groupKey, timeframe: '5m' })),
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
        avgResponseTime,
        queueDepth: {
          accepted: queueAccepted,
          delayed: queueDelayed,
          waitingRetry: queueWaitingRetry
        },
        throttling: {
          totalThrottled,
          reasonDistribution: Object.keys(reasonDistribution).length > 0 
            ? reasonDistribution 
            : { 'unknown': totalThrottled }
        }
      });
    }
    
    return {
      timestamp: new Date(now).toISOString(),
      groups
    };
  }
  
  async getStatusMetrics(): Promise<Record<string, any>> {
    // Implementation needed
    return {};
  }
  
  async getHistoricalMetrics(timeframe: string, metricName?: string): Promise<Record<string, any>> {
    // Implementation needed
    return {};
  }

  /**
   * Get cooldown insights for a group or all groups
   * @param groupKey Optional group key to filter by
   * @param timeframe Time window for historical analysis
   */
  async getCooldownInsights(groupKey?: string, timeframe: string = '24h'): Promise<Record<string, any>> {
    const now = Date.now();
    const cutoffTime = now - getTimeframeMilliseconds(timeframe);
    const start = new Date(cutoffTime);
    const end = new Date(now);
    
    // Get current cooldowns
    const currentCooldowns: any[] = [];
    
    // If we have a cooldown service registered, use it
    // Otherwise, we'll estimate from metrics
    const activeCooldownGroups = groupKey 
      ? [groupKey].filter(key => this.getGauge('throttle.cooldown_remaining', { groupKey: key }) > 0)
      : this.getActiveCooldownGroups();
    
    // Populate current cooldowns data
    for (const cooldownGroupKey of activeCooldownGroups) {
      const remainingMs = this.getGauge('throttle.cooldown_remaining', { groupKey: cooldownGroupKey });
      const reason = this.getCooldownReason(cooldownGroupKey);
      const orgId = cooldownGroupKey.split(':')[0];
      
      // Get failure count if available
      const failureCount = this.getGauge('throttle.failure_count', { 
        groupKey: cooldownGroupKey 
      });
      
      // Get recent errors for this group
      const recentErrors = await this.getRecentErrors(cooldownGroupKey, '15m');
      
      // Calculate cooldown start and end times
      const duration = this.getGauge('throttle.cooldown_duration', { 
        groupKey: cooldownGroupKey,
        reason
      });
      
      const endTime = new Date(now + remainingMs);
      const startTime = new Date(endTime.getTime() - duration);
      
      currentCooldowns.push({
        groupKey: cooldownGroupKey,
        orgId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        remainingMs,
        reason,
        failureCount,
        recentErrors
      });
    }
    
    // Get historical insights
    const historicalInsights = await this.getHistoricalCooldownInsights(groupKey, start, end);
    
    // Generate recommendations based on patterns
    const recommendations = this.generateCooldownRecommendations(historicalInsights);
    
    return {
      timestamp: new Date(now).toISOString(),
      currentCooldowns,
      historicalInsights,
      recommendations
    };
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
    // Get last N minutes of errors
    const cutoffTime = Date.now() - getTimeframeMilliseconds(timeframe);
    const start = new Date(cutoffTime);
    const end = new Date();
    
    // Try to query dimensional metrics for error distribution
    const results = await this.queryDimensionalMetrics(
      ['request.failed'],
      { groupKey },
      start,
      end,
      'sum'
    );
    
    // Group by status code and count
    const errorsByCode: Record<string, number> = {};
    
    results.forEach(result => {
      const statusCode = result.dimensions.statusCode;
      if (statusCode) {
        errorsByCode[statusCode] = (errorsByCode[statusCode] || 0) + result.value;
      }
    });
    
    // Convert to array of status code counts
    return Object.entries(errorsByCode)
      .map(([statusCode, count]) => ({ statusCode: parseInt(statusCode), count }))
      .sort((a, b) => b.count - a.count);
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
    // This would ideally use time series data to calculate hourly patterns
    // For now, we'll create a basic simulation
    
    const hourlyPattern: any[] = [];
    for (let hour = 0; hour < 24; hour++) {
      // Create simulated data for now
      const avgValue = Math.random() * 10;
      const peakValue = avgValue * (1 + Math.random());
      
      hourlyPattern.push({
        hour,
        avgValue: Math.round(avgValue),
        peakValue: Math.round(peakValue)
      });
    }
    
    // Find peak and low hours
    const peakHours = hourlyPattern
      .sort((a, b) => b.avgValue - a.avgValue)
      .slice(0, 3)
      .map(h => h.hour);
    
    const lowHours = hourlyPattern
      .sort((a, b) => a.avgValue - b.avgValue)
      .slice(0, 3)
      .map(h => h.hour);
    
    return {
      hourlyPattern,
      peakHours,
      lowHours,
      peakPeriod: `${peakHours[0]}-${peakHours[0] + 2}`
    };
  }

  /**
   * Generate recommendations based on cooldown patterns
   * @private
   */
  private generateCooldownRecommendations(historicalInsights: any): any[] {
    const recommendations: any[] = [];
    
    // Check for frequent cooldowns
    if (historicalInsights.mostFrequentGroups.length > 0) {
      const topGroup = historicalInsights.mostFrequentGroups[0];
      
      if (topGroup.cooldownCount > 10) {
        // Find most common reason
        const reasons = Object.entries(historicalInsights.primaryReasons);
        reasons.sort((a, b) => (b[1] as number) - (a[1] as number));
        
        const topReason = reasons.length > 0 ? reasons[0][0] : 'unknown';
        
        let issue: string;
        let suggestion: string;
        
        if (topReason === 'RATE_LIMIT_EXCEEDED') {
          issue = 'Frequent cooldowns due to rate limiting';
          suggestion = 'Increase rate limit threshold or implement client-side throttling';
        } else if (topReason === 'FAILURE_THRESHOLD_EXCEEDED') {
          issue = 'Frequent cooldowns due to downstream service failures';
          suggestion = 'Investigate downstream service reliability during peak hours';
        } else {
          issue = `Frequent cooldowns due to ${topReason}`;
          suggestion = 'Review throttling configuration and downstream service capacity';
        }
        
        recommendations.push({
          groupKey: topGroup.groupKey,
          issue,
          suggestion
        });
      }
    }
    
    // Check for peak hour issues
    if (historicalInsights.timeDistribution.peakHours.length > 0) {
      const peakHour = historicalInsights.timeDistribution.peakHours[0];
      
      recommendations.push({
        groupKey: 'system',
        issue: `High cooldown activity during hour ${peakHour}`,
        suggestion: 'Consider capacity planning for peak usage periods'
      });
    }
    
    return recommendations;
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
    const results = [];
    
    for (const metricName of metricNames) {
      const timeSeries = await this.getTimeSeries(metricName, dimensions, start, end);
      
      if (timeSeries.length === 0) {
        results.push({
          metric: metricName,
          dimensions,
          value: 0,
          sampleCount: 0
        });
        continue;
      }
      
      // Calculate aggregation
      let value = 0;
      switch (aggregation) {
        case 'sum':
          value = timeSeries.reduce((sum, point) => sum + point.value, 0);
          break;
        case 'min':
          value = Math.min(...timeSeries.map(point => point.value));
          break;
        case 'max':
          value = Math.max(...timeSeries.map(point => point.value));
          break;
        case 'avg':
        default:
          value = timeSeries.reduce((sum, point) => sum + point.value, 0) / timeSeries.length;
          break;
      }
      
      results.push({
        metric: metricName,
        dimensions,
        value,
        sampleCount: timeSeries.length
      });
    }
    
    return results;
  }

  /**
   * Get unique group keys from available metrics
   * @private
   */
  private getUniqueGroupKeys(): string[] {
    const groupKeys = new Set<string>();
    
    // Extract from request.received counter
    const receivedMetrics = (this.memoryStore as any)?.counters?.get('request.received');
    if (receivedMetrics) {
      receivedMetrics.getAll().forEach((counter: any) => {
        const groupKey = counter.dimensions.groupKey;
        if (groupKey) {
          groupKeys.add(groupKey);
        }
      });
    }
    
    // Extract from active requests gauge
    const activeMetrics = (this.memoryStore as any)?.gauges?.get('system.group_active_requests');
    if (activeMetrics) {
      activeMetrics.getAll().forEach((gauge: any) => {
        const groupKey = gauge.dimensions.groupKey;
        if (groupKey) {
          groupKeys.add(groupKey);
        }
      });
    }
    
    return Array.from(groupKeys);
  }
} 