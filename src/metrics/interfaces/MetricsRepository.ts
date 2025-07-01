import { TimePoint } from './TimePoint';

/**
 * Core interface for metrics storage and retrieval
 */
export interface MetricsRepository {
  // Counter methods
  incrementCounter(name: string, value: number, dimensions?: Record<string, string>): void;
  getCounter(name: string, dimensions?: Record<string, string>): number;
  
  // Gauge methods
  recordGauge(name: string, value: number, dimensions?: Record<string, string>): void;
  getGauge(name: string, dimensions?: Record<string, string>): number;
  
  // Timer methods
  recordTiming(name: string, durationMs: number, dimensions?: Record<string, string>): void;
  getTimingStats(name: string, dimensions?: Record<string, string>): {
    avg: number;
    min: number;
    max: number;
    p95?: number;
    p99?: number;
  };
  
  // Histogram methods
  recordHistogram(name: string, value: number, dimensions?: Record<string, string>): void;
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
  };
  
  // Time series methods
  getTimeSeries(name: string, dimensions: Record<string, string>, start: Date, end: Date): Promise<TimePoint[]>;
  
  // // Legacy compatibility methods
  recordRequestStart(requestId: string, requestGroupKey: string): void;
  recordRequestCompletion(requestId: string, statusCode: number): void;
  recordRetryAttempt(requestId: string, requestGroupKey: string, attemptNumber: number): void;
  recordCooldownActivation(requestGroupKey: string, duration: number, reason?: string): void;
  
  // API methods for dashboards
  getSummaryMetrics(): Promise<Record<string, any>>;
  getGroupMetrics(): Promise<Record<string, any>>;
  getStatusMetrics(): Promise<Record<string, any>>;
  getHistoricalMetrics(timeframe: string, metricName?: string): Promise<Record<string, any>>;
  
  // Advanced querying
  queryDimensionalMetrics(
    metricNames: string[],
    dimensions: Record<string, string>,
    start: Date,
    end: Date,
    aggregation?: string
  ): Promise<Array<{
    metric: string;
    dimensions: Record<string, string>;
    value: number;
    sampleCount: number;
  }>>;
}

