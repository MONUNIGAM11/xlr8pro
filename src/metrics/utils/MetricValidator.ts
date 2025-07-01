/**
 * Metric validation utilities
 */

export interface MetricDefinition {
  name: string;
  type: string;
  description: string;
  dimensions: string[];
}

export class MetricValidationError extends Error {
  constructor(message: string, public metricName: string, public expectedDimensions: string[], public providedDimensions: string[]) {
    super(message);
    this.name = 'MetricValidationError';
  }
}

/**
 * Validates that provided dimensions match the metric definition
 */
export class MetricValidator {
  /**
   * Validate dimensions against metric definition
   * @param metricDef The metric definition to validate against
   * @param dimensions The dimensions being provided
   * @throws MetricValidationError if validation fails
   */
  static validateDimensions(metricDef: MetricDefinition, dimensions: Record<string, string>): void {
    const expectedDimensions = metricDef.dimensions || [];
    const providedDimensions = Object.keys(dimensions);
    
    // Check for missing required dimensions
    const missingDimensions = expectedDimensions.filter(dim => !providedDimensions.includes(dim));
    if (missingDimensions.length > 0) {
      throw new MetricValidationError(
        `Missing required dimensions for metric '${metricDef.name}': ${missingDimensions.join(', ')}`,
        metricDef.name,
        expectedDimensions,
        providedDimensions
      );
    }
    
    // Check for unexpected dimensions (optional - can be disabled for flexibility)
    const unexpectedDimensions = providedDimensions.filter(dim => !expectedDimensions.includes(dim));
    if (unexpectedDimensions.length > 0) {
      console.warn(
        `Unexpected dimensions for metric '${metricDef.name}': ${unexpectedDimensions.join(', ')}. ` +
        `Expected: [${expectedDimensions.join(', ')}]`
      );
    }
    
    // Check for empty dimension values
    const emptyDimensions = providedDimensions.filter(dim => !dimensions[dim] || dimensions[dim].trim() === '');
    if (emptyDimensions.length > 0) {
      throw new MetricValidationError(
        `Empty dimension values for metric '${metricDef.name}': ${emptyDimensions.join(', ')}`,
        metricDef.name,
        expectedDimensions,
        providedDimensions
      );
    }
  }
  
  /**
   * Sanitize dimension values to ensure they're valid
   * @param dimensions The dimensions to sanitize
   * @returns Sanitized dimensions
   */
  static sanitizeDimensions(dimensions: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(dimensions)) {
      // Convert to string and trim
      let sanitizedValue = String(value || '').trim();
      
      // Replace problematic characters for metric systems
      sanitizedValue = sanitizedValue.replace(/[^a-zA-Z0-9._:-]/g, '_');
      
      // Ensure it's not empty after sanitization
      sanitized[key] = sanitizedValue || 'unknown';
    }
    
    return sanitized;
  }
  
  /**
   * Create a safe metric recording wrapper
   * @param metricDef The metric definition
   * @param dimensions The dimensions to validate
   * @param recorder The function to call if validation passes
   */
  static safeRecord<T>(
    metricDef: MetricDefinition, 
    dimensions: Record<string, string>,
    recorder: (sanitizedDimensions: Record<string, string>) => T
  ): T | null {
    try {
      const sanitizedDimensions = this.sanitizeDimensions(dimensions);
      this.validateDimensions(metricDef, sanitizedDimensions);
      return recorder(sanitizedDimensions);
    } catch (error) {
      if (error instanceof MetricValidationError) {
        console.error(`Metric validation failed: ${error.message}`);
      } else {
        console.error(`Unexpected error recording metric '${metricDef.name}':`, error);
      }
      return null;
    }
  }
}
