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
  mongoUri?: string,
  options?: {
    flushIntervalMs?: number;
    rawMetricsTtlHours?: number;
    aggregatedTtlDays?: number;
    memoryTimeSeriesCapacity?: number;
    histogramSamples?: number;
  }
): Promise<{ repository: MetricsRepository }> {
  // If MongoDB URI is provided, use MongoMetricsRepository
  if (mongoUri) {
    // const { MongoMetricsRepository } = await import('./storage/MongoMetricsRepository');
    // const repository = new MongoMetricsRepository(mongoUri, 'xlr8plus_metrics', options);
    // await repository.initialize();
    // return { repository };
    console.warn('MongoDB integration is currently disabled.');
    return { repository: null as any };
  }
  
  // Otherwise fall back to in-memory only
  const repository = new MemoryMetricsStore(
    options?.memoryTimeSeriesCapacity,
    options?.histogramSamples
  );
  console.log('In-memory metrics store initialized.');
  return { repository };
}

export { bootstrapMetricsSystem } from './bootstrap'; 