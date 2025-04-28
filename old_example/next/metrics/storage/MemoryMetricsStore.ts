import { MetricsRepository } from '../interfaces/MetricsRepository';
import { TimePoint } from '../interfaces/TimePoint';
import { CircularBuffer } from './CircularBuffer';
import { DimensionalCounter } from './DimensionalCounter';
import { Histogram } from './Histogram';

/**
 * In-memory metrics store that implements the MetricsRepository interface
 * Provides both dimensional metrics capabilities and legacy compatibility
 */
export class MemoryMetricsStore implements MetricsRepository {
  // Core storage structures
  private counters: Map<string, DimensionalCounter> = new Map();
  private gauges: Map<string, DimensionalCounter> = new Map();
  private timers: Map<string, DimensionalCounter> = new Map();
  private histograms: Map<string, Map<string, Histogram>> = new Map();
  private timeSeries: Map<string, Map<string, CircularBuffer<TimePoint>>> = new Map();
  
  // Legacy compatibility structures
  private requestTimings: Record<string, { startTime: number, requestGroupKey: string, orgId?: string }> = {};
  private retryTracker: Map<string, { originalStatusCode: number, retriedAt: number }> = new Map();
  
  /**
   * Create a new memory metrics store
   * @param timeSeriesCapacity Maximum number of points to keep per time series (default: 1440 = 24h at 1m resolution)
   * @param histogramSamples Maximum number of samples to keep per histogram (default: 1000)
   */
  constructor(
    private timeSeriesCapacity: number = 1440,
    private histogramSamples: number = 1000
  ) {}
  
  // #region Counter Methods
  
  /**
   * Increment a counter metric
   * @param name Metric name
   * @param value Amount to increment by
   * @param dimensions Optional dimensions for the metric
   */
  incrementCounter(name: string, value: number, dimensions?: Record<string, string>): void {
    if (!this.counters.has(name)) {
      this.counters.set(name, new DimensionalCounter());
    }
    
    this.counters.get(name)!.increment(dimensions || {}, value);
    
    // Also record in time series for this counter
    this.recordTimeSeriesPoint(name, value, dimensions);
  }
  
  /**
   * Get the current value of a counter
   * @param name Metric name
   * @param dimensions Optional dimensions for the metric
   * @returns Current counter value
   */
  getCounter(name: string, dimensions?: Record<string, string>): number {
    if (!this.counters.has(name)) {
      return 0;
    }
    
    return this.counters.get(name)!.get(dimensions || {});
  }
  
  // #endregion
  
  // #region Gauge Methods
  
  /**
   * Record a gauge metric value
   * @param name Metric name
   * @param value Current value to record
   * @param dimensions Optional dimensions for the metric
   */
  recordGauge(name: string, value: number, dimensions?: Record<string, string>): void {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, new DimensionalCounter());
    }
    
    // For gauges, we set the absolute value rather than incrementing
    this.gauges.get(name)!.set(dimensions || {}, value);
    
    // Also record in time series
    this.recordTimeSeriesPoint(name, value, dimensions);
  }
  
  /**
   * Get the current value of a gauge
   * @param name Metric name
   * @param dimensions Optional dimensions for the metric
   * @returns Current gauge value
   */
  getGauge(name: string, dimensions?: Record<string, string>): number {
    if (!this.gauges.has(name)) {
      return 0;
    }
    
    return this.gauges.get(name)!.get(dimensions || {});
  }
  
  // #endregion
  
  // #region Timer Methods
  
  /**
   * Record a timing metric
   * @param name Metric name
   * @param durationMs Duration in milliseconds
   * @param dimensions Optional dimensions for the metric
   */
  recordTiming(name: string, durationMs: number, dimensions?: Record<string, string>): void {
    // Update the timer sum
    if (!this.timers.has(name)) {
      this.timers.set(name, new DimensionalCounter());
    }
    
    this.timers.get(name)!.increment(dimensions || {}, durationMs);
    
    // Increment the count for this timer
    const countKey = `${name}.count`;
    if (!this.counters.has(countKey)) {
      this.counters.set(countKey, new DimensionalCounter());
    }
    
    this.counters.get(countKey)!.increment(dimensions || {}, 1);
    
    // Also record in histogram if we track statistical distribution
    this.recordHistogram(name, durationMs, dimensions);
    
    // Also record in time series
    this.recordTimeSeriesPoint(name, durationMs, dimensions);
  }
  
  /**
   * Get statistics for a timer
   * @param name Metric name
   * @param dimensions Optional dimensions for the metric
   * @returns Object with timer statistics
   */
  getTimingStats(name: string, dimensions?: Record<string, string>): { 
    avg: number; 
    min: number; 
    max: number; 
    p95?: number;
    p99?: number;
  } {
    // If we have histogram data, use it for more accurate stats
    try {
      const stats = this.getHistogramStats(name, dimensions);
      return {
        avg: stats.avg,
        min: stats.min,
        max: stats.max,
        p95: stats.p95,
        p99: stats.p99
      };
    } catch {
      // Otherwise calculate basic average from counters
      if (!this.timers.has(name)) {
        return { avg: 0, min: 0, max: 0 };
      }
      
      const total = this.timers.get(name)!.get(dimensions || {});
      const countKey = `${name}.count`;
      const count = this.counters.get(countKey)?.get(dimensions || {}) || 1;
      
      return {
        avg: total / count,
        min: 0, // We can't track min without histograms
        max: 0  // We can't track max without histograms
      };
    }
  }
  
  // #endregion
  
  // #region Histogram Methods
  
  /**
   * Record a value in a histogram
   * @param name Metric name
   * @param value Value to record
   * @param dimensions Optional dimensions for the metric
   */
  recordHistogram(name: string, value: number, dimensions?: Record<string, string>): void {
    const dimensionKey = this.dimensionsToKey(dimensions || {});
    
    if (!this.histograms.has(name)) {
      this.histograms.set(name, new Map());
    }
    
    if (!this.histograms.get(name)!.has(dimensionKey)) {
      this.histograms.get(name)!.set(dimensionKey, new Histogram(this.histogramSamples));
    }
    
    this.histograms.get(name)!.get(dimensionKey)!.record(value);
    
    // Also record in time series for this histogram
    this.recordTimeSeriesPoint(name, value, dimensions);
  }
  
  /**
   * Get statistics for a histogram
   * @param name Metric name
   * @param dimensions Optional dimensions for the metric
   * @returns Object with histogram statistics
   */
  getHistogramStats(name: string, dimensions?: Record<string, string>): {
    count: number;
    sum: number;
    min: number;
    max: number;
    avg: number;
    p50?: number;
    p90?: number;
    p95?: number;
    p99?: number;
  } {
    const dimensionKey = this.dimensionsToKey(dimensions || {});
    
    if (!this.histograms.has(name) || !this.histograms.get(name)!.has(dimensionKey)) {
      return {
        count: 0,
        sum: 0,
        min: 0,
        max: 0,
        avg: 0
      };
    }
    
    return this.histograms.get(name)!.get(dimensionKey)!.getStats();
  }
  
  // #endregion
  
  // #region Time Series Methods
  
  /**
   * Get time series data for a metric
   * @param name Metric name
   * @param dimensions Dimensions to filter by
   * @param start Start time
   * @param end End time
   * @returns Promise with array of time points
   */
  async getTimeSeries(name: string, dimensions: Record<string, string>, start: Date, end: Date): Promise<TimePoint[]> {
    const dimensionKey = this.dimensionsToKey(dimensions);
    
    if (!this.timeSeries.has(name) || !this.timeSeries.get(name)!.has(dimensionKey)) {
      return [];
    }
    
    const buffer = this.timeSeries.get(name)!.get(dimensionKey)!;
    return buffer.getRange(start.getTime(), end.getTime());
  }
  
  /**
   * Record a data point in a time series
   * @param name Metric name
   * @param value Value to record
   * @param dimensions Optional dimensions
   */
  private recordTimeSeriesPoint(name: string, value: number, dimensions?: Record<string, string>): void {
    const dimensionKey = this.dimensionsToKey(dimensions || {});
    
    if (!this.timeSeries.has(name)) {
      this.timeSeries.set(name, new Map());
    }
    
    if (!this.timeSeries.get(name)!.has(dimensionKey)) {
      this.timeSeries.get(name)!.set(dimensionKey, new CircularBuffer<TimePoint>(this.timeSeriesCapacity));
    }
    
    this.timeSeries.get(name)!.get(dimensionKey)!.add({
      timestamp: Date.now(),
      value
    });
  }
  
  // #endregion
  
  // #region Legacy Compatibility Methods
  
  /**
   * Record the start of a request (legacy compatibility)
   * @param requestId Unique request ID
   * @param requestGroupKey Group key for the request
   */
  recordRequestStart(requestId: string, requestGroupKey: string): void {
    // Extract organization ID if present in the group key
    const orgId = requestGroupKey.split(':')[0];
    
    // Record request timing info
    this.requestTimings[requestId] = {
      startTime: Date.now(),
      requestGroupKey,
      orgId
    };
    
    // Increment total requests counter with dimensions
    this.incrementCounter('request.received', 1, { 
      groupKey: requestGroupKey,
      orgId
    });
  }
  
  /**
   * Record the completion of a request (legacy compatibility)
   * @param requestId Unique request ID
   * @param statusCode HTTP status code
   */
  recordRequestCompletion(requestId: string, statusCode: number): void {
    // Skip if we don't have timing data
    if (!this.requestTimings[requestId]) {
      return;
    }
    
    const timing = this.requestTimings[requestId];
    const requestGroupKey = timing.requestGroupKey;
    const orgId = timing.orgId;
    const responseTime = Date.now() - timing.startTime;
    
    // Update status code counts
    this.incrementCounter('response.status', 1, { 
      statusCode: statusCode.toString(),
      groupKey: requestGroupKey,
      orgId
    });
    
    // Update success/failure counts
    if (statusCode >= 200 && statusCode < 300) {
      this.incrementCounter('request.completed', 1, { 
        groupKey: requestGroupKey,
        orgId
      });
    } else {
      this.incrementCounter('request.failed', 1, { 
        groupKey: requestGroupKey,
        statusCode: statusCode.toString(),
        orgId
      });
    }
    
    // Record response time
    this.recordTiming('request.response_time', responseTime, { 
      groupKey: requestGroupKey,
      statusCode: statusCode.toString(),
      orgId
    });
    
    // Clean up timing data
    delete this.requestTimings[requestId];
  }
  
  /**
   * Record a retry attempt (legacy compatibility)
   * @param requestId Unique request ID
   * @param requestGroupKey Group key for the request
   * @param attemptNumber Retry attempt number
   */
  recordRetryAttempt(requestId: string, requestGroupKey: string, attemptNumber: number): void {
    // Extract organization ID if present in the group key
    const orgId = requestGroupKey.split(':')[0];
    
    // Increment retry counter with dimensions
    this.incrementCounter('retry.attempts', 1, { 
      groupKey: requestGroupKey,
      attemptNumber: attemptNumber.toString(),
      orgId
    });
    
    // Mark this request as being retried
    this.retryTracker.set(requestId, {
      originalStatusCode: 0,
      retriedAt: Date.now()
    });
  }
  
  /**
   * Record a cooldown activation (legacy compatibility)
   * @param requestGroupKey Group key for the request
   * @param duration Cooldown duration in ms
   * @param reason Optional reason for cooldown
   */
  recordCooldownActivation(requestGroupKey: string, duration: number, reason?: string): void {
    // Extract organization ID if present in the group key
    const orgId = requestGroupKey.split(':')[0];
    
    // Increment cooldown counter
    this.incrementCounter('cooldown.activated', 1, { 
      groupKey: requestGroupKey,
      reason: reason || 'unknown',
      orgId
    });
    
    // Record cooldown duration
    this.recordHistogram('cooldown.duration', duration, {
      groupKey: requestGroupKey,
      reason: reason || 'unknown',
      orgId
    });
  }
  
  // #endregion
  
  // #region Dashboard API Methods
  
  /**
   * Get overall system metrics summary
   * @returns Promise with summary metrics
   */
  async getSummaryMetrics(): Promise<Record<string, any>> {
    const now = Date.now();
    
    // Get active request count
    const activeRequests = this.getGauge('system.active_requests');
    
    // Get active request groups count
    const activeRequestGroups = this.getGauge('system.active_groups');
    
    // Get cooldown groups count
    const cooldownGroups = this.getGauge('system.cooldown_groups');
    
    // Get system load
    const systemLoad = this.getGauge('system.load');
    
    // Get capacity utilization
    const capacityUtilization = this.getGauge('capacity.utilization');
    
    // Get cooldown group details (this would be enhanced with actual group data)
    // This is a placeholder - real implementation would query GroupRepository
    const cooldownGroupsDetails: Array<{key: string, remainingTime: number, reason?: string, failureCount?: number}> = [];
    
    // Calculate success rate
    const totalRequests = this.getCounter('request.received');
    const successfulRequests = this.getCounter('request.completed');
    const failedRequests = this.getCounter('request.failed');
    
    let successRate = 0;
    if (totalRequests > 0) {
      successRate = (successfulRequests / totalRequests) * 100;
    }
    
    return {
      timestamp: new Date(now).toISOString(),
      counters: {
        totalRequests,
        successfulRequests,
        failedRequests,
        retryAttempts: this.getCounter('retry.attempts'),
        rateLimitHits: this.getCounter('throttle.rejected'),
        cooldownActivations: this.getCounter('cooldown.activated')
      },
      current: {
        activeRequests,
        activeRequestGroups,
        cooldownGroups,
        systemLoad,
        capacityUtilization
      },
      successRate: `${successRate.toFixed(2)}%`,
      cooldownGroups: cooldownGroupsDetails
    };
  }
  
  /**
   * Get per-group metrics
   * @returns Promise with group metrics
   */
  async getGroupMetrics(): Promise<Record<string, any>> {
    // Placeholder implementation - would be enhanced with actual group data
    const groups: any[] = [];
    
    // Extract unique group keys from counters
    const groupKeys = new Set<string>();
    
    // Collect group keys from request counters
    this.counters.get('request.received')?.getAll().forEach(counter => {
      const groupKey = counter.dimensions.groupKey;
      if (groupKey) {
        groupKeys.add(groupKey);
      }
    });
    
    // Process each group
    for (const groupKey of groupKeys) {
      // Get basic counts
      const totalRequests = this.getCounter('request.received', { groupKey });
      const successfulRequests = this.getCounter('request.completed', { groupKey });
      const failedRequests = this.getCounter('request.failed', { groupKey });
      const retryAttempts = this.getCounter('retry.attempts', { groupKey });
      const cooldownActivations = this.getCounter('cooldown.activated', { groupKey });
      
      // Calculate success rate
      const successRate = totalRequests > 0 
        ? (successfulRequests / totalRequests * 100).toFixed(2) + '%'
        : '0.00%';
      
      // Get response time stats
      const responseTimeStats = this.getTimingStats('request.response_time', { groupKey });
      const avgResponseTime = `${Math.round(responseTimeStats.avg)}ms`;
      
      // Add group data
      groups.push({
        key: groupKey,
        current: {
          // Placeholder - would come from real group repository
          activeRequests: 0,
          inCooldown: false,
          cooldownRemaining: 0
        },
        aggregate: {
          total: totalRequests,
          success: successfulRequests,
          failure: failedRequests,
          retries: retryAttempts,
          cooldowns: cooldownActivations
        },
        successRate,
        avgResponseTime
      });
    }
    
    return {
      timestamp: new Date().toISOString(),
      groups
    };
  }
  
  /**
   * Get status code metrics
   * @returns Promise with status metrics
   */
  async getStatusMetrics(): Promise<Record<string, any>> {
    const byCode: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    
    // Get status distribution data from counters
    this.counters.get('response.status')?.getAll().forEach(counter => {
      const statusCode = counter.dimensions.statusCode;
      if (statusCode) {
        byCode[statusCode] = (byCode[statusCode] || 0) + counter.value;
        
        // Categorize status codes
        const category = this.categorizeStatusCode(statusCode);
        byCategory[category] = (byCategory[category] || 0) + counter.value;
      }
    });
    
    // Calculate retry effectiveness
    const retryEffectiveness = {
      byCategory: {
        http_rate_limit: "0%",
        http_server_error: "0%",
        http_gateway_error: "0%",
        http_service_unavailable: "0%"
      }
    };
    
    // This would need to be implemented with actual retry success data
    
    return {
      timestamp: new Date().toISOString(),
      byCode,
      byCategory,
      retryEffectiveness
    };
  }
  
  /**
   * Get historical metrics data
   * @param timeframe Time window (e.g., "1h", "24h")
   * @param metricName Optional specific metric to retrieve
   * @returns Promise with historical metrics
   */
  async getHistoricalMetrics(timeframe: string, metricName?: string): Promise<Record<string, any>> {
    const cutoffTime = Date.now() - this.getTimeframeMilliseconds(timeframe);
    const start = new Date(cutoffTime);
    const end = new Date();
    
    // If no specific metric requested, return all standard time series
    if (!metricName) {
      const activeRequests = await this.getTimeSeries('system.active_requests', {}, start, end);
      const activeGroups = await this.getTimeSeries('system.active_groups', {}, start, end);
      const cooldownGroups = await this.getTimeSeries('system.cooldown_groups', {}, start, end);
      const responseTime = await this.getTimeSeries('request.response_time', {}, start, end);
      
      return {
        timeframe,
        activeRequests,
        activeGroups,
        cooldownGroups,
        responseTime
      };
    }
    
    // Specific metric requested
    const timeSeriesData = await this.getTimeSeries(metricName, {}, start, end);
    
    return {
      timeframe,
      metric: metricName,
      resolution: this.getResolutionForTimeframe(timeframe),
      points: timeSeriesData
    };
  }
  
  /**
   * Query multi-dimensional metrics
   * @param metricNames Array of metric names to query
   * @param dimensions Dimension filters
   * @param start Start time
   * @param end End time
   * @param aggregation Aggregation method
   * @returns Promise with query results
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
  
  // #endregion
  
  // #region Helper Methods
  
  /**
   * Convert dimensions object to a string key for storage
   */
  private dimensionsToKey(dimensions: Record<string, string>): string {
    return Object.entries(dimensions)
      .sort(([k1], [k2]) => k1.localeCompare(k2))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
  }
  
  /**
   * Convert a timeframe string to milliseconds
   */
  private getTimeframeMilliseconds(timeframe: string): number {
    const value = parseInt(timeframe.match(/^\d+/)?.[0] || '1', 10);
    const unit = timeframe.slice(-1);
    
    switch(unit) {
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 60 * 60 * 1000; // Default to 1 hour
    }
  }
  
  /**
   * Get the appropriate resolution for a timeframe
   */
  private getResolutionForTimeframe(timeframe: string): string {
    const hours = this.getTimeframeMilliseconds(timeframe) / (1000 * 60 * 60);
    
    if (hours <= 6) return '1m';
    if (hours <= 24) return '5m';
    if (hours <= 168) return '1h';
    return '1d';
  }
  
  /**
   * Categorize HTTP status codes
   */
  private categorizeStatusCode(statusCode: string): string {
    const code = parseInt(statusCode, 10);
    
    if (code >= 200 && code < 300) return 'http_success';
    if (code === 401 || code === 403) return 'http_auth_failure';
    if (code === 429) return 'http_rate_limit';
    if (code >= 400 && code < 500) return 'http_client_error';
    if (code === 502 || code === 504) return 'http_gateway_error';
    if (code === 503) return 'http_service_unavailable';
    if (code >= 500) return 'http_server_error';
    if (code === 0) return 'network_error';
    
    return 'unknown';
  }
  
  /**
   * Prepare metrics data for batch write to persistent storage
   * @returns Array of metric records for batch writing
   */
  prepareForBatch(): Array<{
    name: string;
    type: string;
    value: number;
    dimensions: Record<string, string>;
    timestamp: Date;
  }> {
    const batchData: Array<{
      name: string;
      type: string;
      value: number;
      dimensions: Record<string, string>;
      timestamp: Date;
    }> = [];
    
    // Add counter data
    for (const [name, counter] of this.counters.entries()) {
      for (const { dimensions, value, timestamp } of counter.getAll()) {
        batchData.push({
          name,
          type: 'counter',
          value,
          dimensions,
          timestamp: new Date(timestamp)
        });
      }
    }
    
    // Add gauge data
    for (const [name, gauge] of this.gauges.entries()) {
      for (const { dimensions, value, timestamp } of gauge.getAll()) {
        batchData.push({
          name,
          type: 'gauge',
          value,
          dimensions,
          timestamp: new Date(timestamp)
        });
      }
    }
    
    // Add timer/histogram data
    for (const [name, histogramMap] of this.histograms.entries()) {
      for (const [dimensionKey, histogram] of histogramMap.entries()) {
        const stats = histogram.getStats();
        const dimensions = this.keyToDimensions(dimensionKey);
        
        batchData.push({
          name,
          type: 'histogram',
          value: stats.avg, // Store the average as the primary value
          dimensions,
          timestamp: new Date(stats.lastUpdated)
        });
      }
    }
    
    return batchData;
  }
  
  /**
   * Convert string key back to dimensions object
   */
  private keyToDimensions(key: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (key === '') return result;
    
    key.split(',').forEach(pair => {
      const [k, v] = pair.split(':');
      result[k] = v;
    });
    
    return result;
  }
  
  /**
   * Clear old gauges that haven't been updated recently
   * @param maxAgeMs Maximum age in milliseconds
   */
  cleanupStaleGauges(maxAgeMs: number): void {
    const cutoff = Date.now() - maxAgeMs;
    
    for (const [name, gauge] of this.gauges.entries()) {
      const metrics = gauge.getAll();
      const outdatedKeys = metrics
        .filter(m => m.timestamp < cutoff)
        .map(m => this.dimensionsToKey(m.dimensions));
      
      for (const key of outdatedKeys) {
        const dimensions = this.keyToDimensions(key);
        gauge.reset(dimensions);
      }
    }
  }
  
  // #endregion
} 