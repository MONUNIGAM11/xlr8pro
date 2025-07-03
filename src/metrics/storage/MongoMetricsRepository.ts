import { Collection, Db, MongoClient } from 'mongodb';
// import { TimePoint } from '../interfaces/TimePoint';
// import { MemoryMetricsStore } from './MemoryMetricsStore';

interface CounterMetric {
  _id?: string;
  metricName: string;
  groupKey: string;
  dimensions: Record<string, string>;
  status?: string;
  value: number;
  timestamp: string; // ISO string
}

interface GaugeMetric {
  _id?: string;
  metricName: string;
  groupKey: string;
  dimensions: Record<string, string>;
  value: number;
  timestamp: string;
}

interface TimerMetric {
  _id?: string;
  metricName: string;
  groupKey: string;
  dimensions: Record<string, string>;
  value: number;  // sum of durations
  count: number;  // number of recorded timings
  timestamp: string;
}

interface HistogramMetric {
  _id?: string;
  metricName: string;
  groupKey: string;
  dimensions: Record<string, string>;
  count: number;
  sum: number;
  min: number;
  max: number;
  buckets: Record<string, number>;
  samples?: number[];
  timestamp: string;
}

interface TimeSeriesMetric {
  _id?: string;
  metricName: string;
  groupKey: string;
  dimensions: Record<string, string>;
  buffer: {
    timestamp: string;
    value: number;
  }[];
  capacity: number;
  size: number;
  head: number;
  timestamp: string;
}


/**
 * Implementation of MetricsRepository that persists data to MongoDB
 * Uses an in-memory store for real-time access and flushes to MongoDB periodically
 */
export class MongoMetricsRepository  {
  private CouterCollection: Collection<CounterMetric>;
  private GaugeCollection: Collection<GaugeMetric>;
  private TimerCollection: Collection<TimerMetric>;
  private HistogramCollection: Collection<HistogramMetric>;
  private TimeSeriesCollection: Collection<TimeSeriesMetric>;
  private client: MongoClient | null = null;
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
    // Initialize with default values
    this.options = {
      flushIntervalMs: 60000,
      rawMetricsTtlHours: 24,
      aggregatedTtlDays: 90,
      memoryTimeSeriesCapacity: 1440,
      histogramSamples: 1000,
      ...options
    };
  }
  
  /**
   * Initialize the MongoDB connection and collections
   */
  async initialize(): Promise<void> {
    try {
      this.client = new MongoClient(this.connectionString);
      await this.client.connect();
      
      const db = this.client.db(this.databaseName);
      
      // Set up collections with indexes
      this.CouterCollection = db.collection<CounterMetric>('counters');
      this.GaugeCollection = db.collection<GaugeMetric>('gauges');
      this.TimerCollection = db.collection<TimerMetric>('timers');
      this.HistogramCollection = db.collection<HistogramMetric>('histograms');
      this.TimeSeriesCollection = db.collection<TimeSeriesMetric>('time_series'); 
      await this.ensureIndexes();
      
      this.isConnected = true;
      console.log('✅ Connected to MongoDB metrics database');
            
      // Schedule periodic aggregation jobs
      // this.scheduleAggregationJobs();
      
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error);
      this.isConnected = false;
      throw error;
    }
  }
  
  /**
   * Create necessary indexes on MongoDB collections
   */
/**
 * Ensure unique indexes on (metricName, groupKey, dimensions.orgId)
 * for all metric collections.
 */
private async ensureIndexes(): Promise<void> {
  // Raw metrics indexes

  await this.CouterCollection.createIndex(
    {
      metricName: 1,
      groupKey: 1,
      "dimensions.orgId": 1
    },
    { unique: true }
  );
  console.log("✅ Unique index created on 'counters'");

  await this.GaugeCollection.createIndex(
    {
      metricName: 1,
      groupKey: 1,
      "dimensions.orgId": 1
    },
    { unique: true }
  );
  console.log("✅ Unique index created on 'gauges'");

  await this.TimerCollection.createIndex(
    {
      metricName: 1,
      groupKey: 1,
      "dimensions.orgId": 1
    },
    { unique: true }
  );
  console.log("✅ Unique index created on 'timers'");

  await this.HistogramCollection.createIndex(
    {
      metricName: 1,
      groupKey: 1,
      "dimensions.orgId": 1
    },
    { unique: true }
  );
  console.log("✅ Unique index created on 'histograms'");

  await this.TimeSeriesCollection.createIndex(
    {
      metricName: 1,
      groupKey: 1,
      "dimensions.orgId": 1
    },
    { unique: true }
  );
  console.log("✅ Unique index created on 'time_series'");

  console.log("✅ All unique compound indexes created successfully.");
}


  
  
  // /**
  //  * Schedule periodic aggregation jobs
  //  */
  // private scheduleAggregationJobs(): void {
  //   // Minute-level aggregation - runs every 5 minutes
  //   setInterval(() => this.runAggregation('1m', 5), 5 * 60 * 1000);
    
  //   // Hour-level aggregation - runs every hour
  //   setInterval(() => this.runAggregation('1h', 60), 60 * 60 * 1000);
    
  //   // Day-level aggregation - runs once per day
  //   setInterval(() => this.runAggregation('1d', 24 * 60), 24 * 60 * 60 * 1000);
  // }
  
  // /**
  //  * Run aggregation pipeline for a specific period
  //  * @param period Aggregation period ('1m', '1h', '1d')
  //  * @param minutes Number of minutes to include in aggregation
  //  */
  // private async runAggregation(period: string, minutes: number): Promise<void> {
  //   if (!this.isConnected) return;
    
  //   try {
  //     const endTime = new Date();
  //     const startTime = new Date(endTime.getTime() - minutes * 60 * 1000);
      
  //     // Run MongoDB aggregation pipeline
  //     const pipeline = [
  //       {
  //         $match: {
  //           timestamp: { $gte: startTime, $lt: endTime }
  //         }
  //       },
  //       {
  //         $group: {
  //           _id: {
  //             name: '$name',
  //             dimensions: '$dimensions',
  //             period
  //           },
  //           count: { $sum: 1 },
  //           sum: { $sum: '$value' },
  //           min: { $min: '$value' },
  //           max: { $max: '$value' },
  //           values: { $push: '$value' }
  //         }
  //       },
  //       {
  //         $project: {
  //           _id: 0,
  //           name: '$_id.name',
  //           period: '$_id.period',
  //           dimensions: '$_id.dimensions',
  //           timestamp: endTime,
  //           count: 1,
  //           sum: 1,
  //           min: 1,
  //           max: 1,
  //           avg: { $divide: ['$sum', '$count'] },
  //           // We'd ideally calculate percentiles here, but MongoDB's $percentile
  //           // requires MongoDB 5.0+. In a real implementation, we'd calculate these
  //           // or use a dedicated time series database.
  //           ttl: this.calculateTtl(period)
  //         }
  //       }
  //     ];
      
  //     const results = await this.metricsCollection.aggregate(pipeline).toArray();
      
  //     if (results.length > 0) {
  //       await this.aggregatedCollection.insertMany(results as any[]);
  //       console.log(`Aggregated ${results.length} metrics for period ${period}`);
  //     }
  //   } catch (error) {
  //     console.error(`Error running aggregation for period ${period}:`, error);
  //   }
  // }
  
  // /**
  //  * Calculate TTL date for a metric based on period
  //  */
  // private calculateTtl(period: string): Date {
  //   const now = new Date();
  //   const ttlDays = this.options.aggregatedTtlDays || 90; // Default: 90 days
    
  //   // Adjust TTL based on period granularity
  //   switch (period) {
  //     case '1m': 
  //       return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
  //     case '1h':
  //       return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
  //     case '1d':
  //     default:
  //       return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  //   }
  // }
  
  /**
   * Flush in-memory metrics to MongoDB
   */
  async flushToMongo(batchData: {
    counters: Array<{
      metricName: string;
      groupKey: string;
      dimensions: Record<string, string>;
      status?: string;
      value: number;
      timestamp: string;
    }>;
    gauges: Array<{
      metricName: string;
      groupKey: string;
      dimensions: Record<string, string>;
      value: number;
      timestamp: string;
    }>;
    timers: Array<{
      metricName: string;
      groupKey: string;
      dimensions: Record<string, string>;
      value: number;
      count: number;
      timestamp: string;
    }>;
    histograms: Array<{
      metricName: string;
      groupKey: string;
      dimensions: Record<string, string>;
      count: number;
      sum: number;
      min: number;
      max: number;
      buckets: Record<string, number>;
      samples?: number[];
      timestamp: string;
    }>;
    timeSeries: Array<{
      metricName: string;
      groupKey: string;
      dimensions: Record<string, string>;
      buffer: Array<{
        timestamp: string;
        value: number;
      }>;
      capacity: number;
      size: number;
      head: number;
      timestamp: string;
    }>;
  }): Promise<void> {
    if (!this.isConnected) {
      console.warn('Cannot flush metrics: MongoDB not connected');
      return;
    }
    
    try {
      // Prepare batch operations for each collection using upsert
      const operations = [];
      
      // Upsert counters
      if (batchData.counters.length > 0) {
        const counterOps = batchData.counters.map(item => ({
          updateOne: {
            filter: {
              metricName: item.metricName,
              groupKey: item.groupKey,
              'dimensions.orgId': this.getOrgId(item.dimensions)
            },
            update: {
              $inc: { value: item.value }, // Increment counter values
              $set: {
                dimensions: item.dimensions,
                status: item.status,
                timestamp: item.timestamp
              }
            },
            upsert: true
          }
        }));
        operations.push(this.CouterCollection.bulkWrite(counterOps));
      }
      
      // Upsert gauges (gauges are absolute values, so we set them)
      if (batchData.gauges.length > 0) {
        const gaugeOps = batchData.gauges.map(item => ({
          updateOne: {
            filter: {
              metricName: item.metricName,
              groupKey: item.groupKey,
              'dimensions.orgId': this.getOrgId(item.dimensions)
            },
            update: {
              $set: {
                value: item.value, // Set absolute value for gauges
                dimensions: item.dimensions,
                timestamp: item.timestamp
              }
            },
            upsert: true
          }
        }));
        operations.push(this.GaugeCollection.bulkWrite(gaugeOps));
      }
      
      // Upsert timers
      if (batchData.timers.length > 0) {
        const timerOps = batchData.timers.map(item => ({
          updateOne: {
            filter: {
              metricName: item.metricName,
              groupKey: item.groupKey,
              'dimensions.orgId': this.getOrgId(item.dimensions)
            },
            update: {
              $inc: { 
                value: item.value, // Increment sum of durations
                count: item.count  // Increment count
              },
              $set: {
                dimensions: item.dimensions,
                timestamp: item.timestamp
              }
            },
            upsert: true
          }
        }));
        operations.push(this.TimerCollection.bulkWrite(timerOps));
      }
      
      // Upsert histograms
      if (batchData.histograms.length > 0) {
        const histogramOps = batchData.histograms.map(item => ({
          updateOne: {
            filter: {
              metricName: item.metricName,
              groupKey: item.groupKey,
              'dimensions.orgId': this.getOrgId(item.dimensions)
            },
            update: {
              $inc: {
                count: item.count,
                sum: item.sum
              },
              $set: {
                dimensions: item.dimensions,
                buckets: item.buckets,
                samples: item.samples,
                timestamp: item.timestamp
              },
              $min: { min: item.min },
              $max: { max: item.max }
            },
            upsert: true
          }
        }));
        operations.push(this.HistogramCollection.bulkWrite(histogramOps));
      }
      
      // Upsert time series (append to buffer)
      if (batchData.timeSeries.length > 0) {
        const timeSeriesOps = batchData.timeSeries.map(item => ({
          updateOne: {
            filter: {
              metricName: item.metricName,
              groupKey: item.groupKey,
              'dimensions.orgId': this.getOrgId(item.dimensions)
            },
            update: {
              $push: {
                buffer: {
                  $each: item.buffer,
                  $slice: -item.capacity // Keep only the last 'capacity' items
                }
              },
              $set: {
                dimensions: item.dimensions,
                capacity: item.capacity,
                size: item.size,
                head: item.head,
                timestamp: item.timestamp
              }
            },
            upsert: true
          }
        }));
        operations.push(this.TimeSeriesCollection.bulkWrite(timeSeriesOps));
      }
      
      // Execute all operations in parallel
      if (operations.length > 0) {
        const results = await Promise.all(operations);
        const totalModified = results.reduce((sum, result) => sum + result.modifiedCount + result.upsertedCount, 0);
        console.log(`Successfully flushed ${totalModified} metrics to MongoDB across ${operations.length} collections`);
      }
      
    } catch (error) {
      console.error('Error flushing metrics to MongoDB:', error);
    }
  }
    
  /**
   * Get time series data for a metric from MongoDB
   * @param name Metric name
   * @param dimensions Dimensions to filter by
   * @param start Start time
   * @param end End time
   * @returns Promise with array of time points
   */
  async getTimeSeries(name: string, dimensions: Record<string, string>, start: Date, end: Date): Promise<Array<{timestamp: number; value: number}>> {
    if (!this.isConnected) {
      console.warn('Cannot get time series: MongoDB not connected');
      return [];
    }
    
    try {
      const groupKey = this.dimensionsToKey(dimensions);
      
      // Query time series collection
      const timeSeriesResults = await this.TimeSeriesCollection.find({
        metricName: name,
        groupKey: groupKey,
        'dimensions.orgId': this.getOrgId(dimensions),
        timestamp: {
          $gte: start.toISOString(),
          $lte: end.toISOString()
        }
      }).toArray();
      
      // Extract and flatten buffer data from all matching time series
      const timePoints: Array<{timestamp: number; value: number}> = [];
      
      for (const tsRecord of timeSeriesResults) {
        for (const point of tsRecord.buffer) {
          const timestamp = new Date(point.timestamp).getTime();
          if (timestamp >= start.getTime() && timestamp <= end.getTime()) {
            timePoints.push({
              timestamp,
              value: point.value
            });
          }
        }
      }
      
      // Sort by timestamp
      timePoints.sort((a, b) => a.timestamp - b.timestamp);
      
      return timePoints;
      
    } catch (error) {
      console.error('Error getting time series from MongoDB:', error);
      return [];
    }
  }
  
  /**
   * Convert dimensions object to a string key for storage
   */
  private dimensionsToKey(dimensions: Record<string, string>): string {
    return Object.entries(dimensions)
      .sort(([k1], [k2]) => k1.localeCompare(k2))
      .map(([k, v]) => `${k}::${v}`)
      .join(',');
  }
  
  /**
   * Get the orgId from dimensions, with fallback to 'default' if not present
   */
  private getOrgId(dimensions: Record<string, string>): string {
    return dimensions.orgId || 'default';
  }

  /**
   * Shutdown the MongoDB connection and cleanup resources
   */
  async shutdown(): Promise<void> {
    try {
      if (this.flushInterval) {
        clearInterval(this.flushInterval);
        this.flushInterval = null;
      }
      
      if (this.client) {
        await this.client.close();
        this.client = null;
        console.log('✅ MongoDB client disconnected');
      }
      
      this.isConnected = false;
      console.log('✅ MongoDB metrics repository shutdown completed');
    } catch (error) {
      console.error('❌ Error during MongoDB shutdown:', error);
    }
  }
}