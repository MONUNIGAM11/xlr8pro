/**
 * A histogram that tracks distribution statistics
 * Used for metrics where the distribution of values is important
 */
export class Histogram {
  private count: number = 0;
  private sum: number = 0;
  private min: number = Number.MAX_VALUE;
  private max: number = Number.MIN_VALUE;
  private values: number[] = [];
  private lastUpdated: number = 0;
  
  // Configuration
  private readonly maxSamples: number;
  
  /**
   * Create a new histogram
   * @param maxSamples Maximum number of samples to store for percentile calculations
   */
  constructor(maxSamples: number = 1000) {
    this.maxSamples = maxSamples;
  }
  
  /**
   * Record a value in the histogram
   * @param value The value to record
   */
  record(value: number): void {
    this.count++;
    this.sum += value;
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);
    this.lastUpdated = Date.now();
    
    // Store the value for percentile calculations
    // If we've reached capacity, replace a random sample
    if (this.values.length < this.maxSamples) {
      this.values.push(value);
    } else {
      const randomIndex = Math.floor(Math.random() * this.maxSamples);
      this.values[randomIndex] = value;
    }
  }
  
  /**
   * Get all statistics for this histogram
   */
  getStats(): {
    count: number;
    sum: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    lastUpdated: number;
  } {
    if (this.count === 0) {
      return {
        count: 0,
        sum: 0,
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        lastUpdated: this.lastUpdated
      };
    }
    
    // Sort values for percentile calculations
    const sortedValues = [...this.values].sort((a, b) => a - b);
    
    return {
      count: this.count,
      sum: this.sum,
      min: this.min,
      max: this.max,
      avg: this.sum / this.count,
      p50: this.percentile(sortedValues, 50),
      p90: this.percentile(sortedValues, 90),
      p95: this.percentile(sortedValues, 95),
      p99: this.percentile(sortedValues, 99),
      lastUpdated: this.lastUpdated
    };
  }
  
  /**
   * Calculate a percentile from sorted values
   * @param sortedValues Array of values sorted in ascending order
   * @param p Percentile to calculate (0-100)
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))];
  }
  
  /**
   * Reset the histogram
   */
  reset(): void {
    this.count = 0;
    this.sum = 0;
    this.min = Number.MAX_VALUE;
    this.max = Number.MIN_VALUE;
    this.values = [];
    this.lastUpdated = Date.now();
  }
}
