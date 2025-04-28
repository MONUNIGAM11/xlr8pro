/**
 * Utility functions for time operations
 */

/**
 * Convert a timeframe string to milliseconds
 * @param timeframe Format: {number}{unit} where unit is one of m, h, d
 * @returns Milliseconds
 */
export function getTimeframeMilliseconds(timeframe: string): number {
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
 * Round a date to the nearest interval
 * @param date Date to round
 * @param intervalMs Interval in milliseconds
 * @returns Rounded date
 */
export function roundDateToInterval(date: Date, intervalMs: number): Date {
  const timestamp = date.getTime();
  return new Date(Math.floor(timestamp / intervalMs) * intervalMs);
}

/**
 * Generate a sequence of dates at regular intervals
 * @param start Start date
 * @param end End date
 * @param intervalMs Interval in milliseconds
 * @returns Array of dates
 */
export function generateDateRange(start: Date, end: Date, intervalMs: number): Date[] {
  const result: Date[] = [];
  let current = roundDateToInterval(start, intervalMs);
  
  while (current <= end) {
    result.push(new Date(current));
    current = new Date(current.getTime() + intervalMs);
  }
  
  return result;
} 