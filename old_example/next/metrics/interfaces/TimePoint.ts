/**
 * Represents a single data point in a time series
 */
export interface TimePoint {
  /**
   * Unix timestamp in milliseconds
   */
  timestamp: number;
  
  /**
   * The metric value at this point in time
   */
  value: number;
}
