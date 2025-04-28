import { Collection, Db, MongoClient } from 'mongodb';
import { MetricsRepository } from '../interfaces/MetricsRepository';
import { TimePoint } from '../interfaces/TimePoint';
import { MemoryMetricsStore } from './MemoryMetricsStore';

/**
 * MongoDB schema for raw metrics data
 */
interface MetricRecord {
  name: string;
  type: 'counter' | 'gauge' | 'timer' | 'histogram';
  value: number;
  dimensions: Record<string, string>;
  timestamp: Date;
  ttl?: Date;
}

/**
 * MongoDB schema for aggregated metrics
 */
interface AggregatedMetric {
  name: string;
  period: string; // '1m', '5m', '1h', '1d'
  dimensions: Record<string, string>;
  timestamp: Date;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p95?: number;
  p99?: number;
  ttl?: Date;
}

/**
 * Implementation of MetricsRepository that persists data to MongoDB
 * Uses an in-memory store for real-time access and flushes to MongoDB periodically
 */
export class MongoMetricsRepository implements MetricsRepository {
  batchWrite(batchData: { name: string; type: string; value: number; dimensions: Record<string, string>; timestamp: Date; }[]) {
    throw new Error('Method not implemented.');
  }
  private memoryStore: MemoryMetricsStore;
  private metricsCollection: Collection<MetricRecord>;
  private aggregatedCollection: Collection<AggregatedMetric>;
  private isConnected: boolean = false;
  private flushInterval: NodeJS.Timeout | null = null;
  
  /**
   * Create a new MongoDB metrics repository
   * @param connectionString MongoDB connection string
   * @param databaseName Database name
   * @param options Configuration options
   */
  constructor(
    private connectionString: string,
    private databaseName: string = 'xlr8plus_metrics',
    private options: {
      flushIntervalMs?: number;
      rawMetricsTtlHours?: number;
      aggregatedTtlDays?: number;
      memoryTimeSeriesCapacity?: number;
      histogramSamples?: number;
    } = {}
  ) {
    // Create memory store with specified or default capacity
    this.memoryStore = new MemoryMetricsStore(
      options.memoryTimeSeriesCapacity || 1440,
      options.histogramSamples || 1000
    );
  }
  
  /**
   * Initialize the MongoDB connection and collections
   */
  async initialize(): Promise<void> {
    try {
      const client = new MongoClient(this.connectionString);
      await client.connect();
      
      const db = client.db(this.databaseName);
      
      // Set up collections with indexes
      this.metricsCollection = db.collection<MetricRecord>('raw_metrics');
      this.aggregatedCollection = db.collection<AggregatedMetric>('aggregated_metrics');
      
      await this.ensureIndexes();
      
      this.isConnected = true;
      console.log('Connected to MongoDB metrics database');
      
      // Start periodic flush
      const flushIntervalMs = this.options.flushIntervalMs || 60000; // Default: 1 minute
      this.flushInterval = setInterval(() => this.flushToMongo(), flushIntervalMs);
      
      // Schedule periodic aggregation jobs
      this.scheduleAggregationJobs();
      
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      this.isConnected = false;
      throw error;
    }
  }
  
  /**
   * Create necessary indexes on MongoDB collections
   */
  private async ensureIndexes(): Promise<void> {
    // Raw metrics indexes
    await this.metricsCollection.createIndex({ timestamp: 1 });
    await this.metricsCollection.createIndex({ name: 1, timestamp: 1 });
    await this.metricsCollection.createIndex({ 'dimensions.groupKey': 1, timestamp: 1 });
    await this.metricsCollection.createIndex({ ttl: 1 }, { expireAfterSeconds: 0 });
    
    // Compound index for queries with dimensions
    await this.metricsCollection.createIndex({ 
      name: 1, 
      'dimensions.groupKey': 1, 
      'dimensions.orgId': 1, 
      timestamp: 1 
    });
    
    // Aggregated metrics indexes
    await this.aggregatedCollection.createIndex({ timestamp: 1 });
    await this.aggregatedCollection.createIndex({ name: 1, period: 1, timestamp: 1 });
    await this.aggregatedCollection.createIndex({ 'dimensions.groupKey': 1, period: 1, timestamp: 1 });
    await this.aggregatedCollection.createIndex({ ttl: 1 }, { expireAfterSeconds: 0 });
    
    // Compound index for aggregated queries
    await this.aggregatedCollection.createIndex({ 
      name: 1, 
      period: 1, 
      'dimensions.groupKey': 1,
      timestamp: 1 
    });
  }
  
  /**
   * Schedule periodic aggregation jobs
   */
  private scheduleAggregationJobs(): void {
    // Minute-level aggregation - runs every 5 minutes
    setInterval(() => this.runAggregation('1m', 5), 5 * 60 * 1000);
    
    // Hour-level aggregation - runs every hour
    setInterval(() => this.runAggregation('1h', 60), 60 * 60 * 1000);
    
    // Day-level aggregation - runs once per day
    setInterval(() => this.runAggregation('1d', 24 * 60), 24 * 60 * 60 * 1000);
  }
  
  /**
   * Run aggregation pipeline for a specific period
   * @param period Aggregation period ('1m', '1h', '1d')
   * @param minutes Number of minutes to include in aggregation
   */
  private async runAggregation(period: string, minutes: number): Promise<void> {
    if (!this.isConnected) return;
    
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - minutes * 60 * 1000);
      
      // Run MongoDB aggregation pipeline
      const pipeline = [
        {
          $match: {
            timestamp: { $gte: startTime, $lt: endTime }
          }
        },
        {
          $group: {
            _id: {
              name: '$name',
              dimensions: '$dimensions',
              period
            },
            count: { $sum: 1 },
            sum: { $sum: '$value' },
            min: { $min: '$value' },
            max: { $max: '$value' },
            values: { $push: '$value' }
          }
        },
        {
          $project: {
            _id: 0,
            name: '$_id.name',
            period: '$_id.period',
            dimensions: '$_id.dimensions',
            timestamp: endTime,
            count: 1,
            sum: 1,
            min: 1,
            max: 1,
            avg: { $divide: ['$sum', '$count'] },
            // We'd ideally calculate percentiles here, but MongoDB's $percentile
            // requires MongoDB 5.0+. In a real implementation, we'd calculate these
            // or use a dedicated time series database.
            ttl: this.calculateTtl(period)
          }
        }
      ];
      
      const results = await this.metricsCollection.aggregate(pipeline).toArray();
      
      if (results.length > 0) {
        await this.aggregatedCollection.insertMany(results as any[]);
        console.log(`Aggregated ${results.length} metrics for period ${period}`);
      }
    } catch (error) {
      console.error(`Error running aggregation for period ${period}:`, error);
    }
  }
  
  /**
   * Calculate TTL date for a metric based on period
   */
  private calculateTtl(period: string): Date {
    const now = new Date();
    const ttlDays = this.options.aggregatedTtlDays || 90; // Default: 90 days
    
    // Adjust TTL based on period granularity
    switch (period) {
      case '1m': 
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
      case '1h':
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
      case '1d':
      default:
        return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
    }
  }
  
  /**
   * Flush in-memory metrics to MongoDB
   */
  async flushToMongo(): Promise<void> {
    if (!this.isConnected) {
      console.warn('Cannot flush metrics: MongoDB not connected');
      return;
    }
    
    try {
      const batchData = this.memoryStore.prepareForBatch();
      
      if (batchData.length === 0) {
        return;
      }
      
      // Calculate TTL for raw metrics
      const ttlHours = this.options.rawMetricsTtlHours || 24; // Default: 24 hours
      const ttl = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
      
      // Prepare records for MongoDB
      const records: MetricRecord[] = batchData.map(item => ({
        name: item.name,
        type: item.type as 'counter' | 'gauge' | 'timer' | 'histogram',
        value: item.value,
        dimensions: item.dimensions,
        timestamp: item.timestamp,
        ttl
      }));
      
      // Insert batch into MongoDB
      const result = await this.metricsCollection.insertMany(records);
      console.log(`Flushed ${result.insertedCount} metrics to MongoDB`);
      
    } catch (error) {
      console.error('Error flushing metrics to MongoDB:', error);
    }
  }
  
  /**
   * Stop the repository and clean up resources
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    // Perform one final flush
    if (this.isConnected) {
      await this.flushToMongo();
    }
  }
  
  // #region MetricsRepository Implementation
  // All methods delegate to the in-memory store first
  
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
  
  getTimingStats(name: string, dimensions?: Record<string, string>): { 
    avg: number; 
    min: number; 
    max: number; 
    p95?: number;
    p99?: number;
  } {
    return this.memoryStore.getTimingStats(name, dimensions);
  }
  
  recordHistogram(name: string, value: number, dimensions?: Record<string, string>): void {
    this.memoryStore.recordHistogram(name, value, dimensions);
  }
  
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
    return this.memoryStore.getHistogramStats(name, dimensions);
  }
  
  async getTimeSeries(name: string, dimensions: Record<string, string>, start: Date, end: Date): Promise<TimePoint[]> {
    // First try in-memory data for recent points
    const memoryPoints = await this.memoryStore.getTimeSeries(name, dimensions, start, end);
    
    // If we have enough recent data or we're not connected to MongoDB, return memory data
    if (memoryPoints.length > 0 || !this.isConnected) {
      return memoryPoints;
    }
    
    // Otherwise, query MongoDB for historical data
    try {
      const dimensionsFilter: Record<string, any> = {};
      
      // Convert dimensions to MongoDB filter format
      for (const [key, value] of Object.entries(dimensions)) {
        dimensionsFilter[`dimensions.${key}`] = value;
      }
      
      const records = await this.metricsCollection.find({
        name,
        ...dimensionsFilter,
        timestamp: { $gte: start, $lte: end }
      }).sort({ timestamp: 1 }).toArray();
      
      // Convert to TimePoint format
      return records.map(record => ({
        timestamp: record.timestamp.getTime(),
        value: record.value
      }));
      
    } catch (error) {
      console.error('Error querying time series from MongoDB:', error);
      return memoryPoints;
    }
  }
  
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
  
  async getSummaryMetrics(): Promise<Record<string, any>> {
    return this.memoryStore.getSummaryMetrics();
  }
  
  async getGroupMetrics(): Promise<Record<string, any>> {
    return this.memoryStore.getGroupMetrics();
  }
  
  async getStatusMetrics(): Promise<Record<string, any>> {
    return this.memoryStore.getStatusMetrics();
  }
  
  async getHistoricalMetrics(timeframe: string, metricName?: string): Promise<Record<string, any>> {
    if (!this.isConnected) {
      return this.memoryStore.getHistoricalMetrics(timeframe, metricName);
    }
    
    // For historical metrics, we want to use the pre-aggregated data from MongoDB if available
    try {
      const period = this.getPeriodForTimeframe(timeframe);
      const cutoffTime = this.getTimeframeCutoff(timeframe);
      
      // Convert to appropriate MongoDB filter
      const filter: any = {
        period,
        timestamp: { $gte: cutoffTime }
      };
      
      if (metricName) {
        filter.name = metricName;
      }
      
      // Query the aggregated collection
      const records = await this.aggregatedCollection
        .find(filter)
        .sort({ timestamp: 1 })
        .toArray();
      
      // Structure the response based on whether a specific metric was requested
      if (metricName) {
        // Group by dimensions for the specific metric
        const timeSeriesPoints = records.map(record => ({
          timestamp: record.timestamp.getTime(),
          value: record.avg,
          dimensions: record.dimensions
        }));
        
        return {
          timeframe,
          metric: metricName,
          resolution: period,
          points: timeSeriesPoints
        };
      } else {
        // Return multiple metrics for the dashboard
        const metricsByName: Record<string, any[]> = {};
        
        // Group records by metric name
        for (const record of records) {
          if (!metricsByName[record.name]) {
            metricsByName[record.name] = [];
          }
          
          metricsByName[record.name].push({
            timestamp: record.timestamp.getTime(),
            value: record.avg,
            dimensions: record.dimensions
          });
        }
        
        return {
          timeframe,
          resolution: period,
          ...metricsByName
        };
      }
      
    } catch (error) {
      console.error('Error querying historical metrics from MongoDB:', error);
      // Fall back to in-memory data if MongoDB query fails
      return this.memoryStore.getHistoricalMetrics(timeframe, metricName);
    }
  }
  
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
    // If we're not connected to MongoDB, use in-memory data
    if (!this.isConnected) {
      return this.memoryStore.queryDimensionalMetrics(metricNames, dimensions, start, end, aggregation);
    }
    
    try {
      // Convert dimensions to MongoDB filter format
      const dimensionsFilter: Record<string, any> = {};
      for (const [key, value] of Object.entries(dimensions)) {
        dimensionsFilter[`dimensions.${key}`] = value;
      }
      
      // Build aggregation pipeline
      const pipeline = [
        {
          $match: {
            name: { $in: metricNames },
            ...dimensionsFilter,
            timestamp: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: {
              name: '$name',
              dimensions: '$dimensions'
            },
            count: { $sum: 1 },
            sum: { $sum: '$value' },
            min: { $min: '$value' },
            max: { $max: '$value' },
            avg: { $avg: '$value' }
          }
        },
        {
          $project: {
            _id: 0,
            metric: '$_id.name',
            dimensions: '$_id.dimensions',
            count: 1,
            sum: 1,
            min: 1,
            max: 1,
            avg: 1
          }
        }
      ];
      
      const results = await this.metricsCollection.aggregate(pipeline).toArray();
      
      // Map results to expected format
      return results.map(result => {
        let value: number;
        
        // Apply the requested aggregation function
        switch (aggregation) {
          case 'sum': value = result.sum; break;
          case 'min': value = result.min; break;
          case 'max': value = result.max; break;
          case 'avg':
          default: value = result.avg; break;
        }
        
        return {
          metric: result.metric,
          dimensions: result.dimensions,
          value,
          sampleCount: result.count
        };
      });
      
    } catch (error) {
      console.error('Error querying dimensional metrics from MongoDB:', error);
      // Fall back to in-memory data if MongoDB query fails
      return this.memoryStore.queryDimensionalMetrics(metricNames, dimensions, start, end, aggregation);
    }
  }
  
  // #endregion
  
  // #region Helper Methods
  
  /**
   * Convert timeframe string to a Date object representing the cutoff time
   */
  private getTimeframeCutoff(timeframe: string): Date {
    const now = new Date();
    const match = timeframe.match(/^(\d+)([mhd])$/);
    
    if (!match) {
      return new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default to 24h
    }
    
    const value = parseInt(match[1], 10);
    const unit = match[2];
    
    switch (unit) {
      case 'm': return new Date(now.getTime() - value * 60 * 1000);
      case 'h': return new Date(now.getTime() - value * 60 * 60 * 1000);
      case 'd': return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
      default: return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }
  
  /**
   * Determine the appropriate aggregation period for a timeframe
   */
  private getPeriodForTimeframe(timeframe: string): string {
    const match = timeframe.match(/^(\d+)([mhd])$/);
    
    if (!match) {
      return '1h'; // Default to 1h for unknown formats
    }
    
    const value = parseInt(match[1], 10);
    const unit = match[2];
    
    if (unit === 'm' || (unit === 'h' && value <= 6)) {
      return '1m'; // Use minute resolution for timeframes <= 6h
    }
    
    if (unit === 'h' || (unit === 'd' && value <= 7)) {
      return '1h'; // Use hour resolution for timeframes <= 7d
    }
    
    return '1d'; // Use day resolution for longer timeframes
  }
  
  // #endregion
} 