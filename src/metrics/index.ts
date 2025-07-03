/**
 * xlr8plus Metrics System
 * 
 * This module provides a comprehensive metrics and observability system for the xlr8plus async offload proxy.
 * It supports both in-memory metrics for real-time monitoring and MongoDB persistence for historical analytics.
 */

import { MetricsRepository } from './interfaces/MetricsRepository';
import { MemoryMetricsStore } from './storage/MemoryMetricsStore';

// Core interfaces
export * from './interfaces/TimePoint';
export * from './interfaces/MetricsRepository';

// Data structures
export * from './storage/CircularBuffer';
export * from './storage/DimensionalCounter';
export * from './storage/Histogram';

// Metric definitions
export * from './definitions/MetricDefinitions';

// Storage implementations
export * from './storage/MemoryMetricsStore';
// export * from './storage/MongoMetricsRepository';

// Collection mechanisms
export * from './collection/MetricsEventListener';
export * from './collection/MetricsStateCollector';

// Controllers & routes
export * from './controllers/MetricsController';
export * from './routes/metricsRoutes';

// Utility functions
export * from './utils/TimeUtils';

// Service layer
export * from './services/MetricsService';

/**
 * Initialize the metrics system
 * @param mongoUri Optional MongoDB connection string for persistence
 * @param options Configuration options
 */
export async function initializeMetricsSystem(
  options: {
    flushIntervalMs?: number;
    rawMetricsTtlHours?: number;
    aggregatedTtlDays?: number;
    memoryTimeSeriesCapacity?: number;
    histogramSamples?: number;
  }= {
      flushIntervalMs: 60000, // Default: flush every minute
      memoryTimeSeriesCapacity: 1440 // Default: 24h at 1-min resolution
    }
): Promise<{ repository: MemoryMetricsStore }> {
  // If MongoDB URI is provided, use MongoMetricsRepositor
  // Otherwise fall back to in-memory only
  const repository = new MemoryMetricsStore(options.memoryTimeSeriesCapacity);
  
  console.log('In-memory metrics store initialized.');
  return { repository };
}

export { bootstrapMetricsSystem } from './bootstrap'; 