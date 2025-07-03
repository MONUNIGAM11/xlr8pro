import { MetricsRepository } from '../interfaces/MetricsRepository';
import { 
  RequestMetrics, 
  ThrottleMetrics, 
  CircuitBreakerMetrics,
  RetryMetrics,
  DimensionKey,
  QueueMetrics,
  SystemMetrics,
  DeadLetterMetrics,
  StatusCategory,
  ConnectionMetrics,
  MetricType
} from '../definitions/MetricDefinitions';
import { EventType } from '../../events/EventBus';
import { MetricValidator, MetricDefinition } from '../utils/MetricValidator';

/**
 * Event types that the metrics system can listen to
 */
// export enum EventType {
//   // Request lifecycle events
//   REQUEST_RECEIVED = 'REQUEST_RECEIVED',
//   REQUEST_VALIDATED = 'REQUEST_VALIDATED',
//   REQUEST_ACCEPTED = 'REQUEST_ACCEPTED',
//   REQUEST_FORWARDED = 'REQUEST_FORWARDED',
//   RESPONSE_RECEIVED = 'RESPONSE_RECEIVED',
//   RETRY_SCHEDULED = 'RETRY_SCHEDULED',
//   REQUEST_COMPLETED = 'REQUEST_COMPLETED',
//   REQUEST_FAILED = 'REQUEST_FAILED',
//   // Throttling and cooldown events
//   COOLDOWN_ACTIVATED = 'COOLDOWN_ACTIVATED',
//   COOLDOWN_EXPIRED = 'COOLDOWN_EXPIRED',
//   RATE_LIMITED = 'RATE_LIMITED',
//   CAPACITY_UPDATED = 'CAPACITY_UPDATED',
//   // Circuit breaker events
//   CIRCUIT_OPENED = 'CIRCUIT_OPENED',
//   CIRCUIT_CLOSED = 'CIRCUIT_CLOSED',
//   // Future events
//   DEADLETTER_ADDED = 'DEADLETTER_ADDED',
//   SHUTDOWN_INITIATED = 'SHUTDOWN_INITIATED',
//   REQUEST_MALFORMED = 'REQUEST_MALFORMED',
//   RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
//   REQUEST_DELAYED = 'REQUEST_DELAYED',
//   RESPONSE_SENT = 'RESPONSE_SENT'

// }


/**
 * Generic event interface
 */
interface Event {
  type: EventType;
  requestId?: string;
  groupKey?: string;
  orgId?: string;
  payload?: Record<string, any>;
  timestamp?: number;
}

/**
 * Event bus interface
 */
interface EventBus {
  subscribe(eventType: EventType | string, handler: (event: Event) => void): void;
  unsubscribe(eventType: EventType | string, handler: (event: Event) => void): void;
}

/**
 * Listens to system events and records metrics accordingly
 */
export class MetricsEventListener {
  private handlersByType: Map<EventType, ((event: Event) => void)> = new Map();
  
  constructor(
    private eventBus: EventBus,
    private metricsRepository: MetricsRepository
  ) {
    this.subscribeToEvents();
  }
  
  /**
   * Subscribe to all events of interest
   */
  private subscribeToEvents(): void {
    // Request lifecycle events
    console.log("ye hai ye = ", EventType.REQUEST_RECEIVED)
    this.subscribe(EventType.REQUEST_RECEIVED, this.handleRequestReceived.bind(this));
    this.subscribe(EventType.REQUEST_VALIDATED, this.handleRequestValidated.bind(this));
    this.subscribe(EventType.REQUEST_ACCEPTED, this.handleRequestAccepted.bind(this));
    this.subscribe(EventType.REQUEST_FORWARDED, this.handleRequestForwarded.bind(this));
    this.subscribe(EventType.RESPONSE_RECEIVED, this.handleResponseReceived.bind(this));
    this.subscribe(EventType.RETRY_SCHEDULED, this.handleRetryScheduled.bind(this));
    this.subscribe(EventType.REQUEST_COMPLETED, this.handleRequestCompleted.bind(this));
    this.subscribe(EventType.REQUEST_FAILED, this.handleRequestFailed.bind(this));
    
    // Throttling and cooldown events
    this.subscribe(EventType.COOLDOWN_ACTIVATED, this.handleCooldownActivated.bind(this));
    this.subscribe(EventType.COOLDOWN_EXPIRED, this.handleCooldownExpired.bind(this));
    this.subscribe(EventType.RATE_LIMITED, this.handleRateLimited.bind(this));
    
    // System events
    this.subscribe(EventType.CAPACITY_UPDATED, this.handleCapacityUpdated.bind(this));
    
    // Circuit breaker events
    this.subscribe(EventType.CIRCUIT_OPENED, this.handleCircuitOpened.bind(this));
    this.subscribe(EventType.CIRCUIT_CLOSED, this.handleCircuitClosed.bind(this));
    
    // Future events
    this.subscribe(EventType.DEADLETTER_ADDED, this.handleDeadletterAdded.bind(this));
  }
  
  /**
   * Subscribe to an event type
   */
  private subscribe(eventType: EventType, handler: (event: Event) => void): void {
    this.handlersByType.set(eventType, handler);
    this.eventBus.subscribe(eventType, handler);
  }
  
  /**
   * Unsubscribe from all events
   */
  unsubscribeAll(): void {
    for (const [eventType, handler] of this.handlersByType.entries()) {
      this.eventBus.unsubscribe(eventType, handler);
    }
    this.handlersByType.clear();
  }
  
  // #region Event Handlers
  
  /**
   * Record a counter metric with dimension validation
   */
  private recordCounter(metricDef: any, value: number, dimensions: Record<string, string>): void {
    MetricValidator.safeRecord(metricDef, dimensions, (sanitizedDimensions) => {
      switch (metricDef.type) {
        case MetricType.COUNTER:
          // Use enhanced method if available, fallback to legacy
          if (this.metricsRepository.recordMetric) {
            this.metricsRepository.recordMetric(metricDef, value, sanitizedDimensions);
          } else {
            this.metricsRepository.incrementCounter(metricDef.name, value, sanitizedDimensions);
          }
          break;
        default:
          console.warn(`Trying to record counter for non-counter metric: ${metricDef.name} (${metricDef.type})`);
          this.metricsRepository.incrementCounter(metricDef.name, value, sanitizedDimensions);
      }
    });
  }
  
  /**
   * Record a timing metric with dimension validation
   */
  private recordTiming(metricDef: any, durationMs: number, dimensions: Record<string, string>): void {
    MetricValidator.safeRecord(metricDef, dimensions, (sanitizedDimensions) => {
      switch (metricDef.type) {
        case MetricType.TIMER:
          if (this.metricsRepository.recordTimingMetric) {
            this.metricsRepository.recordTimingMetric(metricDef, durationMs, sanitizedDimensions);
          } else {
            this.metricsRepository.recordTiming(metricDef.name, durationMs, sanitizedDimensions);
          }
          break;
        default:
          console.warn(`Trying to record timing for non-timer metric: ${metricDef.name} (${metricDef.type})`);
          this.metricsRepository.recordTiming(metricDef.name, durationMs, sanitizedDimensions);
      }
    });
  }
  
  /**
   * Record a histogram metric with dimension validation
   */
  private recordHistogram(metricDef: any, value: number, dimensions: Record<string, string>): void {
    MetricValidator.safeRecord(metricDef, dimensions, (sanitizedDimensions) => {
      switch (metricDef.type) {
        case MetricType.HISTOGRAM:
          if (this.metricsRepository.recordHistogramMetric) {
            this.metricsRepository.recordHistogramMetric(metricDef, value, sanitizedDimensions);
          } else {
            this.metricsRepository.recordHistogram(metricDef.name, value, sanitizedDimensions);
          }
          break;
        default:
          console.warn(`Trying to record histogram for non-histogram metric: ${metricDef.name} (${metricDef.type})`);
          this.metricsRepository.recordHistogram(metricDef.name, value, sanitizedDimensions);
      }
    });
  }
  
  /**
   * Record a gauge metric with dimension validation
   */
  private recordGauge(metricDef: any, value: number, dimensions: Record<string, string>): void {
    MetricValidator.safeRecord(metricDef, dimensions, (sanitizedDimensions) => {
      switch (metricDef.type) {
        case MetricType.GAUGE:
          if (this.metricsRepository.recordGaugeMetric) {
            this.metricsRepository.recordGaugeMetric(metricDef, value, sanitizedDimensions);
          } else {
            this.metricsRepository.recordGauge(metricDef.name, value, sanitizedDimensions);
          }
          break;
        default:
          console.warn(`Trying to record gauge for non-gauge metric: ${metricDef.name} (${metricDef.type})`);
          this.metricsRepository.recordGauge(metricDef.name, value, sanitizedDimensions);
      }
    });
  }
  
  private handleRequestReceived(event: Event): void {
    const { requestId, groupKey, orgId } = event;
    console.log('Handling REQUEST_RECEIVED event:', event);
    if (!requestId || !groupKey) {
      console.warn('Missing required fields in REQUEST_RECEIVED event');
      return;
    }
    
    // Record using dimension-aware method - validates against RequestMetrics.RECEIVED.dimensions
    this.recordCounter(RequestMetrics.RECEIVED, 1, { 
      [DimensionKey.GROUP_KEY]: groupKey, 
      [DimensionKey.ORG_ID]: orgId || ''
    });
  }
  
  private handleRequestValidated(event: Event): void {
    const { groupKey, orgId } = event;
    
    if (!groupKey) {
      console.warn('Missing groupKey in REQUEST_VALIDATED event');
      return;
    }
    
    // Use dimension-aware method - validates against RequestMetrics.VALIDATED.dimensions
    this.recordCounter(RequestMetrics.VALIDATED, 1, { 
      [DimensionKey.GROUP_KEY]: groupKey, 
      [DimensionKey.ORG_ID]: orgId || ''
    });
  }
  
  private handleRequestAccepted(event: Event): void {
    const { groupKey, orgId, payload } = event;
    
    if (!groupKey) {
      console.warn('Missing groupKey in REQUEST_ACCEPTED event');
      return;
    }
    
    // Record that the request was accepted - validates dimensions
    this.recordCounter(RequestMetrics.ACCEPTED, 1, { 
      [DimensionKey.GROUP_KEY]: groupKey, 
      [DimensionKey.ORG_ID]: orgId || ''
    });
    
    // Record queue time if available - validates dimensions
    const queueTime = payload?.queueTime;
    if (queueTime !== undefined) {
      this.recordTiming(RequestMetrics.QUEUE_TIME, queueTime, { 
        [DimensionKey.GROUP_KEY]: groupKey, 
        [DimensionKey.ORG_ID]: orgId || ''
      });
    }
  }
  
  private handleRequestForwarded(event: Event): void {
    const { groupKey, orgId, payload } = event;
    
    if (!groupKey) {
      console.warn('Missing groupKey in REQUEST_FORWARDED event');
      return;
    }
    
    // Extract hostname if available
    const hostname = payload?.targetUrl.hostname || '';
    
    // Use dimension-aware method - validates against RequestMetrics.FORWARDED.dimensions
    // RequestMetrics.FORWARDED expects: [ORG_ID, GROUP_KEY, HOSTNAME]
    this.recordCounter(RequestMetrics.FORWARDED, 1, { 
      [DimensionKey.GROUP_KEY]: groupKey, 
      [DimensionKey.ORG_ID]: orgId || '',
      [DimensionKey.HOSTNAME]: hostname
    });
    
    // Track downstream service - validates against RequestMetrics.DOWNSTREAM_REQUEST.dimensions
    if (hostname) {
      this.recordCounter(RequestMetrics.DOWNSTREAM_REQUEST, 1, {
        [DimensionKey.GROUP_KEY]: groupKey,
        [DimensionKey.ORG_ID]: orgId || '',
        // Note: HOSTNAME is not in DOWNSTREAM_REQUEST.dimensions, this will show a warning
        // but still record the metric for backward compatibility
        [DimensionKey.HOSTNAME]: hostname
      });
    }
  }
  
  private handleResponseReceived(event: Event): void {
    const { requestId, groupKey, orgId, payload } = event;
    
    if (!requestId || !groupKey) {
      console.warn('Missing required fields in RESPONSE_RECEIVED event');
      return;
    }
    
    // Extract relevant data from payload, including new metrics
    const statusCode = payload?.statusCode || 0;
    const responseTime = payload?.responseTime || 0; // Assuming responseTime is also captured
    const latencyMs = payload?.latencyMs || responseTime; // Use latencyMs if available, fallback to responseTime
    const hostname = payload?.hostname || '';
    const connectionReused = payload?.connectionReused || false; // Extract connectionReused

    // Record status code
    this.recordCounter(RequestMetrics.RESPONSE_STATUS, 1, {
      [DimensionKey.GROUP_KEY]: groupKey,
      [DimensionKey.ORG_ID]: orgId || '',
      [DimensionKey.STATUS_CODE]: statusCode.toString(),
      [DimensionKey.STATUS_CATEGORY]: this.getStatusCategory(statusCode)
    });
    
    // Record latency using recordTiming (which handles percentiles for Timers)
    if (latencyMs > 0) {
      this.recordTiming(RequestMetrics.RESPONSE_TIME, latencyMs, {
        [DimensionKey.GROUP_KEY]: groupKey,
        [DimensionKey.ORG_ID]: orgId || '',
        [DimensionKey.HOSTNAME]: hostname
      });
    }
    
    // Record downstream service metrics if hostname exists
    if (hostname) {
      this.recordCounter(RequestMetrics.DOWNSTREAM_RESPONSE, 1, {
        [DimensionKey.HOSTNAME]: hostname,
        [DimensionKey.GROUP_KEY]: groupKey,
        [DimensionKey.ORG_ID]: orgId || '',
        [DimensionKey.STATUS_CODE]: statusCode.toString(),
        [DimensionKey.STATUS_CATEGORY]: this.getStatusCategory(statusCode)
      });
    }

    // Record Connection Reuse
    if (connectionReused) {
      this.recordCounter(ConnectionMetrics.CONNECTION_REUSE_TOTAL, 1, {
        [DimensionKey.GROUP_KEY]: groupKey, // Include groupKey and orgId dimensions
        [DimensionKey.ORG_ID]: orgId || '',
      });
    }
  }
  
  private handleRetryScheduled(event: Event): void {
    const { requestId, groupKey, orgId, payload } = event;
    
    if (!requestId || !groupKey) {
      console.warn('Missing required fields in RETRY_SCHEDULED event');
      return;
    }
    
    const attemptNumber = payload?.attemptNumber || 1;
    const reason = payload?.reason || 'unknown';
    const statusCode = payload?.statusCode || 0;
    const delayMs = payload?.delayMs || 0;
    
    // Record retry metrics
    this.recordCounter(RetryMetrics.ATTEMPTS, 1, {
      [DimensionKey.GROUP_KEY]: groupKey,
      [DimensionKey.ORG_ID]: orgId || '',
      [DimensionKey.ATTEMPT_NUMBER]: attemptNumber.toString(),
      [DimensionKey.RETRY_REASON]: reason,
      [DimensionKey.STATUS_CODE]: statusCode.toString(),
      [DimensionKey.STATUS_CATEGORY]: this.getStatusCategory(statusCode)
    });
    
    // Record retry delay time
    this.recordHistogram(RetryMetrics.DELAY, delayMs, {
      [DimensionKey.GROUP_KEY]: groupKey,
      [DimensionKey.ORG_ID]: orgId || '',
      [DimensionKey.ATTEMPT_NUMBER]: attemptNumber.toString()
    });
  }
  
  private handleRequestCompleted(event: Event): void {
    const { requestId, groupKey, orgId, payload } = event;
    
    if (!requestId || !groupKey) {
      console.warn('Missing required fields in REQUEST_COMPLETED event');
      return;
    }
    
    const statusCode = payload?.statusCode || 200;
    const totalDuration = payload?.totalDuration || 0;
    const attempts = payload?.attempts || 1;
    
    // Record completion metrics
    this.recordCounter(RequestMetrics.COMPLETED, 1, {
      [DimensionKey.GROUP_KEY]: groupKey,
      [DimensionKey.ORG_ID]: orgId || '',
      [DimensionKey.STATUS_CODE]: statusCode.toString(),
      [DimensionKey.STATUS_CATEGORY]: this.getStatusCategory(statusCode)
    });
    
    // Record total time to completion (end-to-end)
    if (totalDuration > 0) {
      this.recordTiming(RequestMetrics.TOTAL_TIME, totalDuration, {
        [DimensionKey.GROUP_KEY]: groupKey,
        [DimensionKey.ORG_ID]: orgId || '',
        [DimensionKey.ATTEMPTS]: attempts.toString()
      });
    }
  }
  
  private handleRequestFailed(event: Event): void {
    const { requestId, groupKey, orgId, payload } = event;
    
    if (!requestId || !groupKey) {
      console.warn('Missing required fields in REQUEST_FAILED event');
      return;
    }
    
    const statusCode = payload?.statusCode || 500;
    const errorType = payload?.errorType || 'unknown';
    const attempts = payload?.attempts || 1;
    const totalDuration = payload?.totalDuration || 0;
    
    // Record failure metrics
    this.recordCounter(RequestMetrics.FAILED, 1, {
      [DimensionKey.GROUP_KEY]: groupKey,
      [DimensionKey.ORG_ID]: orgId || '',
      [DimensionKey.STATUS_CODE]: statusCode.toString(),
      [DimensionKey.STATUS_CATEGORY]: this.getStatusCategory(statusCode),
      [DimensionKey.ERROR_TYPE]: errorType,
      [DimensionKey.ATTEMPTS]: attempts.toString()
    });
    
    // Record total time until failure
    if (totalDuration > 0) {
      this.recordTiming(RequestMetrics.FAILURE_TIME, totalDuration, {
        [DimensionKey.GROUP_KEY]: groupKey,
        [DimensionKey.ORG_ID]: orgId || '',
        [DimensionKey.ERROR_TYPE]: errorType
      });
    }
  }
  
  private handleCooldownActivated(event: Event): void {
    const { groupKey, orgId, payload } = event;
    
    if (!groupKey) {
      console.warn('Missing groupKey in COOLDOWN_ACTIVATED event');
      return;
    }
    
    const duration = payload?.durationMs || 0;
    const reason = payload?.reason || 'unknown';
    const failureCount = payload?.failureCount || 0;
    
    // Record cooldown metrics
    this.recordCounter(ThrottleMetrics.COOLDOWN_ACTIVATED, 1, {
      [DimensionKey.GROUP_KEY]: groupKey,
      [DimensionKey.ORG_ID]: orgId || '',
      [DimensionKey.COOLDOWN_REASON]: reason
    });
    
    // Record cooldown duration
    if (duration > 0) {
      this.recordHistogram(ThrottleMetrics.COOLDOWN_DURATION, duration, {
        [DimensionKey.GROUP_KEY]: groupKey,
        [DimensionKey.ORG_ID]: orgId || '',
        [DimensionKey.COOLDOWN_REASON]: reason
      });
    }
    
    // Record failure count that triggered cooldown
    if (failureCount > 0) {
      this.recordGauge(ThrottleMetrics.FAILURE_COUNT, failureCount, {
        [DimensionKey.GROUP_KEY]: groupKey,
        [DimensionKey.ORG_ID]: orgId || ''
      });
    }
  }
  
  private handleCooldownExpired(event: Event): void {
    const { groupKey, orgId, payload } = event;
    
    if (!groupKey) {
      console.warn('Missing groupKey in COOLDOWN_EXPIRED event');
      return;
    }
    
    const actualDuration = payload?.actualDurationMs || 0;
    
    // Record cooldown expiration
    this.recordCounter(ThrottleMetrics.COOLDOWN_EXPIRED, 1, {
      [DimensionKey.GROUP_KEY]: groupKey,
      [DimensionKey.ORG_ID]: orgId || ''
    });
    
    // Record actual duration (how long the cooldown was actually in effect)
    if (actualDuration > 0) {
      this.recordHistogram(ThrottleMetrics.ACTUAL_COOLDOWN_DURATION, actualDuration, {
        [DimensionKey.GROUP_KEY]: groupKey,
        [DimensionKey.ORG_ID]: orgId || ''
      });
    }
  }
  
  private handleRateLimited(event: Event): void {
    const { groupKey, orgId, payload } = event;
    
    if (!groupKey) {
      console.warn('Missing groupKey in RATE_LIMITED event');
      return;
    }
    
    const reason = payload?.reason || 'rate_limit';
    const limit = payload?.limit || 0;
    const current = payload?.current || 0;
    
    // Record rate limit hit
    this.recordCounter(ThrottleMetrics.RATE_LIMITED, 1, {
      [DimensionKey.GROUP_KEY]: groupKey,
      [DimensionKey.ORG_ID]: orgId || '',
      [DimensionKey.RATE_LIMIT_REASON]: reason
    });
    
    // Record current rate vs limit
    if (limit > 0) {
      this.recordGauge(ThrottleMetrics.RATE_LIMIT_UTILIZATION, (current / limit) * 100, {
        [DimensionKey.GROUP_KEY]: groupKey,
        [DimensionKey.ORG_ID]: orgId || ''
      });
    }
  }
  
  private handleCapacityUpdated(event: Event): void {
    const { payload } = event;
    
    if (!payload) {
      console.warn('Missing payload in CAPACITY_UPDATED event');
      return;
    }
    
    const maxCapacity = payload?.maxCapacity || 0;
    const currentCapacity = payload?.currentCapacity || 0;
    const activeRequests = payload?.activeRequests || 0;
    const activeGroups = payload?.activeGroups || 0;
    const cooldownGroups = payload?.cooldownGroups || 0;
    const utilizationPercent = maxCapacity > 0 ? (currentCapacity / maxCapacity) * 100 : 0;
    
    // Record system capacity metrics
    this.recordGauge(SystemMetrics.MAX_CAPACITY, maxCapacity, {});
    this.recordGauge(SystemMetrics.CAPACITY, currentCapacity, {});
    this.recordGauge(SystemMetrics.CAPACITY_UTILIZATION, utilizationPercent, {});
    
    // Record active requests and groups
    this.recordGauge(SystemMetrics.ACTIVE_REQUESTS, activeRequests, {});
    this.recordGauge(SystemMetrics.ACTIVE_GROUPS, activeGroups, {});
    this.recordGauge(SystemMetrics.COOLDOWN_GROUPS, cooldownGroups, {});
    
    // Record queue metrics if available
    if (payload.queueLength !== undefined) {
      this.recordGauge(QueueMetrics.QUEUE_LENGTH, payload.queueLength, {});
    }
    
    if (payload.queueCapacity !== undefined) {
      this.recordGauge(QueueMetrics.QUEUE_CAPACITY, payload.queueCapacity, {});
      
      // Calculate queue utilization
      const queueUtilization = payload.queueCapacity > 0 
        ? (payload.queueLength / payload.queueCapacity) * 100 
        : 0;
      
      this.recordGauge(QueueMetrics.QUEUE_UTILIZATION, queueUtilization, {});
    }
  }
  
  private handleCircuitOpened(event: Event): void {
    const { groupKey, orgId, payload } = event;
    
    if (!groupKey) {
      console.warn('Missing groupKey in CIRCUIT_OPENED event');
      return;
    }
    
    const reason = payload?.reason || 'unknown';
    const failureCount = payload?.failureCount || 0;
    const durationMs = payload?.durationMs || 30000; // Default to 30s
    
    // Record circuit breaker opened
    this.recordCounter(CircuitBreakerMetrics.OPEN, 1, {
      [DimensionKey.GROUP_KEY]: groupKey,
      [DimensionKey.ORG_ID]: orgId || '',
      [DimensionKey.CIRCUIT_REASON]: reason
    });
    
    // Record failure count and planned duration
    this.recordGauge(CircuitBreakerMetrics.THRESHOLD, failureCount, {
      [DimensionKey.GROUP_KEY]: groupKey,
      [DimensionKey.ORG_ID]: orgId || ''
    });
    
    this.recordGauge(CircuitBreakerMetrics.OPEN_TIME, durationMs, {
      [DimensionKey.GROUP_KEY]: groupKey,
      [DimensionKey.ORG_ID]: orgId || ''
    });
  }
  
  private handleCircuitClosed(event: Event): void {
    const { groupKey, orgId, payload } = event;
    
    if (!groupKey) {
      console.warn('Missing groupKey in CIRCUIT_CLOSED event');
      return;
    }
    
    const actualDurationMs = payload?.actualDurationMs || 0;
    
    // Record circuit breaker closed
    this.recordCounter(CircuitBreakerMetrics.CLOSE, 1, {
      [DimensionKey.GROUP_KEY]: groupKey,
      [DimensionKey.ORG_ID]: orgId || ''
    });
    
    // Record actual open duration
    if (actualDurationMs > 0) {
      this.recordHistogram(CircuitBreakerMetrics.ACTUAL_OPEN_DURATION, actualDurationMs, {
        [DimensionKey.GROUP_KEY]: groupKey,
        [DimensionKey.ORG_ID]: orgId || ''
      });
    }
  }
  
  private handleDeadletterAdded(event: Event): void {
    const { requestId, groupKey, orgId, payload } = event;
    
    if (!requestId || !groupKey) {
      console.warn('Missing required fields in DEADLETTER_ADDED event');
      return;
    }
    
    const reason = payload?.reason || 'unknown';
    const attempts = payload?.attempts || 0;
    const errorType = payload?.errorType || 'unknown';
    
    // Record dead letter metrics
    this.recordCounter(DeadLetterMetrics.ADDED, 1, {
      [DimensionKey.GROUP_KEY]: groupKey,
      [DimensionKey.ORG_ID]: orgId || '',
      [DimensionKey.DEADLETTER_REASON]: reason,
      [DimensionKey.ERROR_TYPE]: errorType,
      [DimensionKey.ATTEMPTS]: attempts.toString()
    });
    
    // Update dead letter count gauge
    this.recordCounter(DeadLetterMetrics.COUNT, 1, {
      [DimensionKey.GROUP_KEY]: groupKey,
      [DimensionKey.ORG_ID]: orgId || ''
    });
  }
  
  // #endregion
  
  /**
   * Map HTTP status code to a category
   */
  private getStatusCategory(statusCode: number): string {
    if (statusCode >= 200 && statusCode < 300) return StatusCategory.SUCCESS;
    if (statusCode === 401 || statusCode === 403) return StatusCategory.AUTH_FAILURE;
    if (statusCode === 429) return StatusCategory.RATE_LIMIT;
    if (statusCode >= 400 && statusCode < 500) return StatusCategory.CLIENT_ERROR;
    if (statusCode === 502 || statusCode === 504) return StatusCategory.GATEWAY_ERROR;
    if (statusCode === 503) return StatusCategory.SERVICE_UNAVAILABLE;
    if (statusCode >= 500) return StatusCategory.SERVER_ERROR;
    if (statusCode === 0) return StatusCategory.NETWORK_ERROR;
    
    return StatusCategory.UNKNOWN;
  }
}