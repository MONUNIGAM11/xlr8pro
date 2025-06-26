import http from 'http';
import { StatusClassifier, StatusCategory } from './StatusClassifier';

/**
 * Retry strategy configuration
 */
export interface RetryStrategy {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  useExponential: boolean;
  jitterPercent: number;
  respectHeaders: boolean;
}

/**
 * Context for retry calculations
 */
export interface RetryContext {
  statusCode: number;
  attemptCount: number;
  headers?: http.IncomingHttpHeaders;
  orgId?: string;
}

/**
 * Service for managing retry strategies
 */
export class RetryService {
  private defaultStrategy: RetryStrategy;
  private categoryStrategies: Record<StatusCategory, RetryStrategy>;
  private orgStrategies: Record<string, Partial<RetryStrategy>>;
  
  /**
   * Create a new RetryService
   */
  constructor() {
    // Default retry strategy
    this.defaultStrategy = {
      maxAttempts: 5,
      baseDelay: 10000, // 10 seconds
      maxDelay: 30000, // 30 seconds
      useExponential: true,
      jitterPercent: 0.2,
      respectHeaders: true
    };
    
    // Status category specific strategies
    this.categoryStrategies = {
      [StatusCategory.HTTP_SUCCESS]: {
        maxAttempts: 0,
        baseDelay: 0,
        maxDelay: 0,
        useExponential: false,
        jitterPercent: 0,
        respectHeaders: false
      },
      [StatusCategory.HTTP_AUTH_FAILURE]: {
        maxAttempts: 0,
        baseDelay: 0,
        maxDelay: 0,
        useExponential: false,
        jitterPercent: 0,
        respectHeaders: false
      },
      [StatusCategory.HTTP_RATE_LIMIT]: {
        maxAttempts: 5,
        baseDelay: 10000, // 10 seconds
        maxDelay: 300000, // 5 minutes
        useExponential: true,
        jitterPercent: 0.1,
        respectHeaders: true
      },
      [StatusCategory.HTTP_CLIENT_ERROR]: {
        maxAttempts: 0,
        baseDelay: 0,
        maxDelay: 0,
        useExponential: false,
        jitterPercent: 0,
        respectHeaders: false
      },
      [StatusCategory.HTTP_SERVER_ERROR]: {
        maxAttempts: 3,
        baseDelay: 5000, // 5 seconds
        maxDelay: 30000, // 30 seconds
        useExponential: true,
        jitterPercent: 0.2,
        respectHeaders: false
      },
      [StatusCategory.HTTP_GATEWAY_ERROR]: {
        maxAttempts: 5,
        baseDelay: 2000, // 2 seconds
        maxDelay: 60000, // 1 minute
        useExponential: true,
        jitterPercent: 0.1,
        respectHeaders: false
      },
      [StatusCategory.HTTP_SERVICE_UNAVAILABLE]: {
        maxAttempts: 3,
        baseDelay: 5000, // 5 seconds
        maxDelay: 30000, // 30 seconds
        useExponential: true,
        jitterPercent: 0.2,
        respectHeaders: true
      },
      [StatusCategory.HTTP_UNKNOWN]: {
        ...this.defaultStrategy
      }
    };
    
    // Organization-specific overrides (empty by default)
    this.orgStrategies = {};
    
    console.log('Retry service initialized');
  }

  /**
   * Set organization-specific retry strategy
   * @param orgId Organization ID
   * @param strategy Retry strategy overrides
   */
  setOrgStrategy(orgId: string, strategy: Partial<RetryStrategy>): void {
    this.orgStrategies[orgId] = strategy;
  }

  /**
   * Get the appropriate retry strategy for a given context
   * @param context Retry context
   * @returns Retry strategy
   */
  getStrategy(context: RetryContext): RetryStrategy {
    const { statusCode, orgId } = context;
    
    // Get the base strategy for the status category
    const category = StatusClassifier.classify(statusCode);
    const baseStrategy = this.categoryStrategies[category] || this.defaultStrategy;
    
    // Apply organization-specific overrides if available
    if (orgId && this.orgStrategies[orgId]) {
      return { ...baseStrategy, ...this.orgStrategies[orgId] };
    }
    
    return baseStrategy;
  }

  /**
   * Should a request be retried based on context
   * @param context Retry context
   * @returns Whether to retry the request
   */
  shouldRetry(context: RetryContext): boolean {
    const { statusCode, attemptCount } = context;
    
    // Get the strategy for this context
    const strategy = this.getStrategy(context);
    
    // Check if max attempts reached
    if (attemptCount >= strategy.maxAttempts) {
      return false;
    }
    
    // Check if the status category is retryable
    return StatusClassifier.isRetryable(statusCode);
  }

  /**
   * Calculate delay for next retry
   * @param context Retry context
   * @returns Delay in milliseconds
   */
  calculateRetryDelay(context: RetryContext): number {
    const { statusCode, attemptCount, headers } = context;
    
    // Get the strategy for this context
    const strategy = this.getStrategy(context);
    
    // Check for Retry-After header if configured to respect headers
    if (strategy.respectHeaders && headers && headers['retry-after']) {
      const retryAfter = this.parseRetryAfterHeader(headers['retry-after']);
      if (retryAfter > 0) {
        // Apply jitter to header value
        return this.applyJitter(retryAfter, strategy.jitterPercent);
      }
    }
    
    // Calculate delay based on attempt count
    let delay = strategy.baseDelay;
    
    if (strategy.useExponential && attemptCount > 0) {
      delay = strategy.baseDelay * Math.pow(2, attemptCount - 1);
    }
    
    // Cap at maximum delay
    if (delay > strategy.maxDelay) {
      delay = strategy.maxDelay;
    }
    
    // Apply jitter
    return this.applyJitter(delay, strategy.jitterPercent);
  }

  /**
   * Parse Retry-After header
   * @param retryAfter Retry-After header value
   * @returns Delay in milliseconds
   */
  private parseRetryAfterHeader(retryAfter: string | string[]): number {
    try {
      const value = Array.isArray(retryAfter) ? retryAfter[0] : retryAfter;
      
      // Check if it's a number of seconds
      if (/^\d+$/.test(value)) {
        return parseInt(value, 10) * 1000;
      }
      
      // Check if it's an HTTP date
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return Math.max(0, date.getTime() - Date.now());
      }
      
      return 0;
    } catch (error) {
      console.error('Error parsing Retry-After header:', error);
      return 0;
    }
  }

  /**
   * Apply jitter to delay
   * @param delay Base delay
   * @param jitterPercent Percentage of jitter to apply (0-1)
   * @returns Delay with jitter
   */
  private applyJitter(delay: number, jitterPercent: number): number {
    const jitterRange = delay * (jitterPercent / 100);
    const jitteredDelay = delay - jitterRange/2 + (Math.random() * jitterRange);
    
    console.log(`Applying jitter: base delay=${delay}ms, jitter=${jitterPercent}%, final delay=${jitteredDelay}ms`);
    
    return jitteredDelay;
  }
}

// Export singleton instance
export const retryService = new RetryService(); 