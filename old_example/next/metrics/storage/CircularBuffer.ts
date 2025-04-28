import { TimePoint } from '../interfaces/TimePoint';

/**
 * A fixed-size circular buffer for time series data
 * Automatically overwrites oldest data when capacity is reached
 */
export class CircularBuffer<T> {
  private buffer: T[];
  private currentIndex: number = 0;
  private isFull: boolean = false;
  private lastTimestamp: number = 0;
  
  /**
   * Create a new circular buffer with the specified capacity
   * @param capacity Maximum number of elements in the buffer
   */
  constructor(private capacity: number) {
    this.buffer = new Array<T>(capacity);
  }
  
  /**
   * Add an item to the buffer, overwriting oldest item if buffer is full
   * @param item The item to add
   */
  add(item: T): void {
    // Update last timestamp if item has timestamp property
    if ((item as any).timestamp) {
      this.lastTimestamp = Math.max(this.lastTimestamp, (item as any).timestamp);
    }
    
    this.buffer[this.currentIndex] = item;
    this.currentIndex = (this.currentIndex + 1) % this.capacity;
    if (!this.isFull && this.currentIndex === 0) {
      this.isFull = true;
    }
  }
  
  /**
   * Get all items in the buffer in chronological order
   */
  getAll(): T[] {
    if (!this.isFull) {
      return this.buffer.slice(0, this.currentIndex);
    }
    
    // When buffer is full, we need to combine two parts
    return [
      ...this.buffer.slice(this.currentIndex),
      ...this.buffer.slice(0, this.currentIndex)
    ];
  }
  
  /**
   * Get items within a specific time range
   * Only works for items that have a timestamp property
   */
  getRange(startTime: number, endTime: number): T[] {
    return this.getAll().filter(item => {
      const timestamp = (item as any).timestamp;
      return timestamp !== undefined && timestamp >= startTime && timestamp <= endTime;
    });
  }
  
  /**
   * Resample time series data to a consistent interval
   * Only works for items that have timestamp and value properties
   * @param intervalMs Target interval in milliseconds
   */
  resample(intervalMs: number): TimePoint[] {
    const allPoints = this.getAll() as unknown as TimePoint[];
    if (allPoints.length <= 1) return allPoints;
    
    // Sort by timestamp
    allPoints.sort((a, b) => a.timestamp - b.timestamp);
    
    const startTime = allPoints[0].timestamp;
    const endTime = allPoints[allPoints.length - 1].timestamp;
    
    const result: TimePoint[] = [];
    
    // Create empty buckets at regular intervals
    for (let t = startTime; t <= endTime; t += intervalMs) {
      // Find points that fall within this interval
      const pointsInInterval = allPoints.filter(
        p => p.timestamp >= t && p.timestamp < t + intervalMs
      );
      
      if (pointsInInterval.length > 0) {
        // Calculate average for this interval
        const sum = pointsInInterval.reduce((acc, p) => acc + p.value, 0);
        const avg = sum / pointsInInterval.length;
        
        result.push({
          timestamp: t,
          value: avg
        });
      }
    }
    
    return result;
  }
  
  /**
   * Get the capacity of the buffer
   */
  getCapacity(): number {
    return this.capacity;
  }
  
  /**
   * Get the current number of items in the buffer
   */
  getSize(): number {
    return this.isFull ? this.capacity : this.currentIndex;
  }
  
  /**
   * Check if the buffer is empty
   */
  isEmpty(): boolean {
    return this.currentIndex === 0 && !this.isFull;
  }
  
  /**
   * Check if the buffer is full
   */
  isFilled(): boolean {
    return this.isFull;
  }
  
  /**
   * Clear all data from the buffer
   */
  clear(): void {
    this.buffer = new Array<T>(this.capacity);
    this.currentIndex = 0;
    this.isFull = false;
    this.lastTimestamp = 0;
  }
}
