/**
 * A counter that supports dimensional (multi-key) tracking
 * Allows incrementing and querying metrics with multiple dimensions
 */
export class DimensionalCounter {
  private counters: Map<string, number> = new Map();
  private timestamps: Map<string, number> = new Map();
  
  /**
   * Increment a counter by the specified value
   * @param dimensions Dimension key-value pairs
   * @param value Amount to increment by (default: 1)
   */
  increment(dimensions: Record<string, string>, value: number = 1): void {
    const key = this.dimensionsToKey(dimensions);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
    this.timestamps.set(key, Date.now());
  }
  
  /**
   * Get the current value of a counter
   * @param dimensions Dimension key-value pairs
   * @returns Current counter value or 0 if not found
   */
  get(dimensions: Record<string, string>): number {
    const key = this.dimensionsToKey(dimensions);
    return this.counters.get(key) || 0;
  }
  
  /**
   * Set a counter to a specific value
   * @param dimensions Dimension key-value pairs
   * @param value Value to set
   */
  set(dimensions: Record<string, string>, value: number): void {
    const key = this.dimensionsToKey(dimensions);
    this.counters.set(key, value);
    this.timestamps.set(key, Date.now());
  }
  
  /**
   * Reset a counter to zero
   * @param dimensions Dimension key-value pairs
   */
  reset(dimensions: Record<string, string>): void {
    const key = this.dimensionsToKey(dimensions);
    this.counters.set(key, 0);
    this.timestamps.set(key, Date.now());
  }
  
  /**
   * Get all counters with their dimensions
   * @returns Array of counter objects with dimensions, value, and timestamp
   */
  getAll(): Array<{ dimensions: Record<string, string>, value: number, timestamp: number }> {
    return Array.from(this.counters.entries()).map(([key, value]) => ({
      dimensions: this.keyToDimensions(key),
      value,
      timestamp: this.timestamps.get(key) || Date.now()
    }));
  }
  
  /**
   * Get counters filtered by a specific dimension value
   * @param dimensionKey The dimension key to filter by
   * @param dimensionValue The dimension value to filter for
   * @returns Filtered array of counter objects
   */
  getByDimension(dimensionKey: string, dimensionValue: string): Array<{ dimensions: Record<string, string>, value: number, timestamp: number }> {
    return this.getAll().filter(item => 
      item.dimensions[dimensionKey] === dimensionValue
    );
  }
  
  /**
   * Get the top N counters by value
   * @param n Number of top counters to return
   * @returns Array of the highest-value counters
   */
  getTopN(n: number): Array<{ dimensions: Record<string, string>, value: number, timestamp: number }> {
    return this.getAll()
      .sort((a, b) => b.value - a.value)
      .slice(0, n);
  }
  
  /**
   * Convert dimensions object to a string key for storage
   * @param dimensions Dimension key-value pairs
   * @returns String key for internal storage
   */
  private dimensionsToKey(dimensions: Record<string, string>): string {
    return Object.entries(dimensions)
      .sort(([k1], [k2]) => k1.localeCompare(k2))
      .map(([k, v]) => `${k}::${v}`)
      .join(',');
  }
  
  /**
   * Convert string key back to dimensions object
   * @param key String key from internal storage
   * @returns Reconstructed dimensions object
   */
  private keyToDimensions(key: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (key === '') return result;
    
    key.split(',').forEach(pair => {
      const [k, v] = pair.split('::');
      result[k] = v;
    });
    
    return result;
  }
  
  /**
   * Get the total number of dimensional counters
   */
  size(): number {
    return this.counters.size;
  }
  
  /**
   * Clear all counters
   */
  clear(): void {
    this.counters.clear();
    this.timestamps.clear();
  }
}
