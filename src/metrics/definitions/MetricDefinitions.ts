/**
 * xlr8plus Metrics Definitions
 * 
 * This file defines all metrics collected by the xlr8plus metrics system.
 * Organized into categories for easy reference and documentation.
 */

/**
 * Metric types supported by the system
 */
export enum MetricType {
    COUNTER = 'counter',   // Cumulative value that only increases
    GAUGE = 'gauge',       // Value that can go up and down
    TIMER = 'timer',       // Duration measurement
    HISTOGRAM = 'histogram', // Distribution of values
  }
  
  /**
   * Common dimension keys used across metrics
   */
  export enum DimensionKey {
    GROUP_KEY = 'groupKey',
    ORG_ID = 'orgId',
    STATUS_CODE = 'statusCode',
    STATUS_CATEGORY = 'statusCategory',
    HOSTNAME = 'hostname',
    ENDPOINT = 'endpoint',
    ERROR_TYPE = 'errorType',
    ATTEMPT_NUMBER = 'attemptNumber',
    REASON = 'reason',
    RETRY_REASON = 'retryReason',
    COOLDOWN_REASON = 'cooldownReason',
    RATE_LIMIT_REASON = 'rateLimitReason',
    CIRCUIT_REASON = 'circuitReason',
    DEADLETTER_REASON = 'deadletterReason',
    ATTEMPTS = 'attempts',
    TIMEFRAME = 'timeframe'
  }
  
  /**
   * Status categories for HTTP responses
   */
  export enum StatusCategory {
    SUCCESS = 'http_success',             // 2xx
    CLIENT_ERROR = 'http_client_error',   // 4xx (general)
    AUTH_FAILURE = 'http_auth_failure',   // 401, 403
    RATE_LIMIT = 'http_rate_limit',       // 429
    SERVER_ERROR = 'http_server_error',   // 5xx (general)
    GATEWAY_ERROR = 'http_gateway_error', // 502, 504
    SERVICE_UNAVAILABLE = 'http_service_unavailable', // 503
    NETWORK_ERROR = 'network_error',      // Connection issues
    TIMEOUT = 'timeout',                  // Request timeouts
    UNKNOWN = 'unknown',
  }
  
  /**
   * Common reasons for events like throttling, cooldowns, etc.
   */
  export enum ReasonCode {
    // Throttling reasons
    GROUP_COOLDOWN = 'GROUP_COOLDOWN',
    GROUP_LIMIT_EXCEEDED = 'GROUP_LIMIT_EXCEEDED',
    GLOBAL_CAPACITY_EXCEEDED = 'GLOBAL_CAPACITY_EXCEEDED',
    
    // Cooldown reasons
    FAILURE_THRESHOLD_EXCEEDED = 'FAILURE_THRESHOLD_EXCEEDED',
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
    MANUAL_ACTIVATION = 'MANUAL_ACTIVATION',
    
    // Retry reasons
    TEMPORARY_ERROR = 'TEMPORARY_ERROR',
    BACKOFF_RETRY = 'BACKOFF_RETRY',
    CIRCUIT_BREAKER_RETRY = 'CIRCUIT_BREAKER_RETRY',
  }
  
  /**
   * Request Lifecycle Metrics
   */
  export const RequestMetrics = {
    // Volume & Flow
    RECEIVED: {
      name: 'request.received',
      type: MetricType.COUNTER,
      description: 'Total incoming requests',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    VALIDATED: {
      name: 'request.validated',
      type: MetricType.COUNTER,
      description: 'Requests that passed validation',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    ACCEPTED: {
      name: 'request.accepted',
      type: MetricType.COUNTER,
      description: 'Requests accepted for processing',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    FORWARDED: {
      name: 'request.forwarded',
      type: MetricType.COUNTER,
      description: 'Requests forwarded to target',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.HOSTNAME],
    },
    
    COMPLETED: {
      name: 'request.completed',
      type: MetricType.COUNTER,
      description: 'Successfully completed requests',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.STATUS_CODE],
    },
    
    FAILED: {
      name: 'request.failed',
      type: MetricType.COUNTER,
      description: 'Failed requests',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.ERROR_TYPE],
    },
    
    DELAYED: {
      name: 'request.delayed',
      type: MetricType.COUNTER,
      description: 'Requests deliberately delayed',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.REASON],
    },
    
    RETRYABLE: {
      name: 'request.retryable',
      type: MetricType.COUNTER,
      description: 'Requests eligible for retry',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.STATUS_CODE],
    },
    
    NON_RETRYABLE: {
      name: 'request.non_retryable',
      type: MetricType.COUNTER,
      description: 'Requests not eligible for retry',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.STATUS_CODE],
    },
    
    // Timing Metrics
    VALIDATION_TIME: {
      name: 'request.validation_time',
      type: MetricType.TIMER,
      description: 'Time spent in validation',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    QUEUE_TIME: {
      name: 'request.queue_time',
      type: MetricType.TIMER,
      description: 'Time spent in queue before forwarding',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    RESPONSE_TIME: {
      name: 'request.response_time',
      type: MetricType.TIMER,
      description: 'Upstream service response time',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.HOSTNAME, DimensionKey.STATUS_CODE],
    },
    
    TOTAL_TIME: {
      name: 'request.total_time',
      type: MetricType.TIMER,
      description: 'End-to-end processing time',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    RETRY_DELAY: {
      name: 'request.retry_delay',
      type: MetricType.TIMER,
      description: 'Time between retry attempts',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.ATTEMPT_NUMBER],
    },
    
    TIME_TO_FIRST_BYTE: {
      name: 'request.time_to_first_byte',
      type: MetricType.TIMER,
      description: 'Time to first byte from upstream',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.HOSTNAME],
    },
    
    PROCESSING_OVERHEAD: {
      name: 'request.processing_overhead',
      type: MetricType.TIMER,
      description: 'xlr8plus processing overhead',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    DOWNSTREAM_REQUEST: {
      name: 'xlr8plus_downstream_request_total',
      type: MetricType.COUNTER,
      description: 'Total downstream requests sent',
      dimensions: [DimensionKey.GROUP_KEY, DimensionKey.ORG_ID]
    },
    
    RESPONSE_STATUS: {
      name: 'xlr8plus_response_status_total',
      type: MetricType.COUNTER,
      description: 'Response status codes received',
      dimensions: [DimensionKey.STATUS_CODE, DimensionKey.STATUS_CATEGORY]
    },
    
    DOWNSTREAM_RESPONSE: {
      name: 'xlr8plus_downstream_response_total',
      type: MetricType.COUNTER,
      description: 'Total downstream responses received',
      dimensions: [DimensionKey.GROUP_KEY, DimensionKey.ORG_ID, DimensionKey.STATUS_CATEGORY]
    },
    FAILURE_TIME: {
      name: 'xlr8plus_failure_time',
      type: MetricType.TIMER,
      description: 'Time taken to process failures',
      dimensions: [DimensionKey.GROUP_KEY, DimensionKey.ORG_ID]
    },

  };
  
  /**
   * Connection Metrics
   */
  export const ConnectionMetrics = {
    CONNECTION_REUSE_TOTAL: {
      name: 'connection.reused_total',
      type: MetricType.COUNTER,
      description: 'Total number of connection reuses',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
  };
  
  /**
   * Throttling & Rate Limiting Metrics
   */
  export const ThrottleMetrics = {
    REJECTED: {
      name: 'throttle.rejected',
      type: MetricType.COUNTER,
      description: 'Rejected due to throttling',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.REASON],
    },
    
    DELAYED: {
      name: 'throttle.delayed',
      type: MetricType.COUNTER,
      description: 'Delayed due to throttling',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.REASON],
    },
    
    ALLOWED_ANYWAY: {
      name: 'throttle.allowed_anyway',
      type: MetricType.COUNTER,
      description: 'Allowed despite throttling conditions',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.REASON],
    },
    
    COOLDOWN_ACTIVATED: {
      name: 'cooldown.activated',
      type: MetricType.COUNTER,
      description: 'Cooldown activations',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.REASON],
    },
    
    COOLDOWN_DURATION: {
      name: 'cooldown.duration',
      type: MetricType.HISTOGRAM,
      description: 'Cooldown duration distribution',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.REASON],
    },
    
    COOLDOWN_ACTIVE_TIME: {
      name: 'cooldown.active_time',
      type: MetricType.TIMER,
      description: 'Total time in cooldown state',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    COOLDOWN_EXPIRED: {
      name: 'cooldown.expired',
      type: MetricType.COUNTER,
      description: 'Cooldown expiration events',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    CAPACITY_LEVEL: {
      name: 'capacity.level',
      type: MetricType.GAUGE,
      description: 'Current system capacity level',
      dimensions: [],
    },
    
    CAPACITY_UTILIZATION: {
      name: 'capacity.utilization',
      type: MetricType.GAUGE,
      description: 'Current capacity utilization (%)',
      dimensions: [],
    },
    COOLDOWN_REMAINING: {
      name: 'cooldown.remaining',
      type: MetricType.GAUGE,
      description: 'Remaining cooldown time',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.COOLDOWN_REASON],
    },
    CAPACITY_ADJUSTED: {
      name: 'capacity.adjusted',
      type: MetricType.COUNTER,
      description: 'Capacity adjustment events',
      dimensions: ['newLevel', 'oldLevel', DimensionKey.REASON],
    },
    
    THROTTLE_REASON_DISTRIBUTION: {
      name: 'throttle.reason_distribution',
      type: MetricType.COUNTER,
      description: 'Distribution of throttle reasons',
      dimensions: [DimensionKey.REASON],
    },
    FAILURE_COUNT: {
      name: 'throttle.failure_count',
      type: MetricType.COUNTER,
      description: 'Failure count due to throttling',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.REASON],
    },
    ACTUAL_COOLDOWN_DURATION: {
      name: 'throttle.actual_cooldown_duration',
      type: MetricType.HISTOGRAM,
      description: 'Actual cooldown duration',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.REASON],
    },
    RATE_LIMIT_UTILIZATION: {
      name: 'throttle.rate_limit_utilization',
      type: MetricType.GAUGE,
      description: 'Rate limit utilization (%)',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    RATE_LIMITED: {
      name: 'throttle.ratelimited',
      type: MetricType.COUNTER,
      description: 'Requests rate limited',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.REASON],
    },


  };
  
  /**
   * Circuit Breaker Metrics
   */
  export const CircuitBreakerMetrics = {
    OPEN: {
      name: 'circuit.open',
      type: MetricType.COUNTER,
      description: 'Circuit open events',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.REASON],
    },
    
    CLOSE: {
      name: 'circuit.close',
      type: MetricType.COUNTER,
      description: 'Circuit close events',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    STATUS: {
      name: 'circuit.status',
      type: MetricType.GAUGE,
      description: 'Current circuit status (0=closed, 1=open)',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    OPEN_TIME: {
      name: 'circuit.open_time',
      type: MetricType.TIMER,
      description: 'Time spent in open state',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    FAILURE_COUNT: {
      name: 'circuit.failure_count',
      type: MetricType.GAUGE,
      description: 'Current failure count',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    THRESHOLD: {
      name: 'circuit.threshold',
      type: MetricType.GAUGE,
      description: 'Current failure threshold',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    SUCCESS_AFTER_OPEN: {
      name: 'circuit.success_after_open',
      type: MetricType.COUNTER,
      description: 'Successful requests after circuit reopened',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    FAILURE_AFTER_OPEN: {
      name: 'circuit.failure_after_open',
      type: MetricType.COUNTER,
      description: 'Failed requests after circuit reopened',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    OPEN_DURATION: {
      name: 'circuit.open_duration',
      type: MetricType.HISTOGRAM,
      description: 'Duration of open state',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    CLOSE_DURATION: {
      name: 'circuit.close_duration',
      type: MetricType.HISTOGRAM,
      description: 'Duration of closed state',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    ACTUAL_OPEN_DURATION: {
      name: 'circuit.actual_open_duration',
      type: MetricType.HISTOGRAM,
      description: 'Actual open duration',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
  };
  
  /**
   * Queue & Backpressure Metrics
   */
  export const QueueMetrics = {
    DEPTH: {
      name: 'queue.depth',
      type: MetricType.GAUGE,
      description: 'Current queue depth',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    PENDING: {
      name: 'queue.pending',
      type: MetricType.GAUGE,
      description: 'Pending requests count',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    DELAYED: {
      name: 'queue.delayed',
      type: MetricType.GAUGE,
      description: 'Delayed requests count',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    WAITING_RETRY: {
      name: 'queue.waiting_retry',
      type: MetricType.GAUGE,
      description: 'Requests waiting for retry',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    GROWTH_RATE: {
      name: 'queue.growth_rate',
      type: MetricType.GAUGE,
      description: 'Queue growth rate (req/sec)',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    AVG_WAIT_TIME: {
      name: 'queue.avg_wait_time',
      type: MetricType.GAUGE,
      description: 'Average wait time in queue',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    SYSTEM_LOAD: {
      name: 'system.load',
      type: MetricType.GAUGE,
      description: 'System load factor',
      dimensions: [],
    },
    
    SYSTEM_MEMORY: {
      name: 'system.memory',
      type: MetricType.GAUGE,
      description: 'Memory utilization (%)',
      dimensions: [],
    },
    
    SYSTEM_CPU: {
      name: 'system.cpu',
      type: MetricType.GAUGE,
      description: 'CPU utilization (%)',
      dimensions: [],
    },
    
    SYSTEM_REJECTION_RATE: {
      name: 'system.rejection_rate',
      type: MetricType.GAUGE,
      description: 'Rate of rejected requests (req/sec)',
      dimensions: [DimensionKey.REASON],
    },
    
    NETWORK_ERRORS: {
      name: 'system.network_errors',
      type: MetricType.COUNTER,
      description: 'Network error occurrences',
      dimensions: [DimensionKey.ERROR_TYPE],
    },
    QUEUE_TIME: {
      name: 'queue.time',
      type: MetricType.TIMER,
      description: 'Time spent in queue',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    QUEUE_LENGTH: {
      name: 'queue.length',
      type: MetricType.GAUGE,
      description: 'Current queue length',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    QUEUE_CAPACITY: {
      name: 'queue.capacity',
      type: MetricType.GAUGE,
      description: 'Current queue capacity',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    QUEUE_UTILIZATION: {
      name: 'queue.utilization',
      type: MetricType.GAUGE,
      description: 'Queue utilization (%)',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
  };
  
  /**
   * Retry & Error Metrics
   */
  export const RetryMetrics = {
    ATTEMPTS: {
      name: 'retry.attempts',
      type: MetricType.COUNTER,
      description: 'Retry attempts by number',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.ATTEMPT_NUMBER],
    },
    
    MAX_REACHED: {
      name: 'retry.max_reached',
      type: MetricType.COUNTER,
      description: 'Max retry attempts reached',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    SUCCESS: {
      name: 'retry.success',
      type: MetricType.COUNTER,
      description: 'Successful retries',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, 'originalStatus', DimensionKey.ATTEMPT_NUMBER],
    },
    
    FAILURE: {
      name: 'retry.failure',
      type: MetricType.COUNTER,
      description: 'Failed retries',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, 'finalStatus', DimensionKey.ATTEMPT_NUMBER],
    },
    
    BY_STATUS_CATEGORY: {
      name: 'retry.by_status_category',
      type: MetricType.COUNTER,
      description: 'Retries by status category',
      dimensions: [DimensionKey.STATUS_CATEGORY, DimensionKey.ATTEMPT_NUMBER],
    },
    
    DELAY: {
      name: 'retry.after_delay',
      type: MetricType.COUNTER,
      description: 'Retries after deliberate delay',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, 'delayReason'],
    },
    
    ERROR_COUNT: {
      name: 'error.count',
      type: MetricType.COUNTER,
      description: 'Errors by status',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.STATUS_CODE, DimensionKey.STATUS_CATEGORY],
    },
    
    ERROR_RATE: {
      name: 'error.rate',
      type: MetricType.GAUGE,
      description: 'Error rate (%)',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    FIRST_FAILURE: {
      name: 'error.first_failure',
      type: MetricType.COUNTER,
      description: 'First failure by status',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.STATUS_CODE],
    },
    
    CONSECUTIVE_FAILURES: {
      name: 'error.consecutive_failures',
      type: MetricType.HISTOGRAM,
      description: 'Distribution of consecutive failures',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
  };
  
  /**
   * Downstream Service Metrics
   */
  export const DownstreamMetrics = {
    RESPONSE_TIME: {
      name: 'downstream.response_time',
      type: MetricType.TIMER,
      description: 'Service response time',
      dimensions: [DimensionKey.HOSTNAME, DimensionKey.ENDPOINT],
    },
    
    ERROR_RATE: {
      name: 'downstream.error_rate',
      type: MetricType.GAUGE,
      description: 'Service error rate (%)',
      dimensions: [DimensionKey.HOSTNAME, DimensionKey.ENDPOINT],
    },
    
    STATUS: {
      name: 'downstream.status',
      type: MetricType.COUNTER,
      description: 'Status code distribution',
      dimensions: [DimensionKey.HOSTNAME, DimensionKey.STATUS_CODE],
    },
    
    RETRY_RATE: {
      name: 'downstream.retry_rate',
      type: MetricType.GAUGE,
      description: 'Retry rate per service (%)',
      dimensions: [DimensionKey.HOSTNAME],
    },
    
    THROUGHPUT: {
      name: 'downstream.throughput',
      type: MetricType.GAUGE,
      description: 'Requests per second',
      dimensions: [DimensionKey.HOSTNAME, DimensionKey.ENDPOINT],
    },
    
    RETRY_EFFECTIVENESS: {
      name: 'downstream.retry_effectiveness',
      type: MetricType.GAUGE,
      description: 'Retry success rate (%)',
      dimensions: [DimensionKey.HOSTNAME, DimensionKey.STATUS_CATEGORY],
    },
    
    AVG_PAYLOAD_SIZE: {
      name: 'downstream.avg_payload_size',
      type: MetricType.HISTOGRAM,
      description: 'Average payload size',
      dimensions: [DimensionKey.HOSTNAME, DimensionKey.ENDPOINT],
    },
    
    TIMEOUT_RATE: {
      name: 'downstream.timeout_rate',
      type: MetricType.GAUGE,
      description: 'Timeout rate (%)',
      dimensions: [DimensionKey.HOSTNAME, DimensionKey.ENDPOINT],
    },
  };
  
  /**
   * System Health Metrics
   */
  export const SystemMetrics = {
    ACTIVE_REQUESTS: {
      name: 'system.active_requests',
      type: MetricType.GAUGE,
      description: 'Current active requests',
      dimensions: [],
    },
    
    ACTIVE_GROUPS: {
      name: 'system.active_groups',
      type: MetricType.GAUGE,
      description: 'Active request groups',
      dimensions: [],
    },
    
    COOLDOWN_GROUPS: {
      name: 'system.cooldown_groups',
      type: MetricType.GAUGE,
      description: 'Groups in cooldown',
      dimensions: [],
    },
    
    SUCCESS_RATE: {
      name: 'system.success_rate',
      type: MetricType.GAUGE,
      description: 'Overall success rate (%)',
      dimensions: [],
    },
    
    THROUGHPUT: {
      name: 'system.throughput',
      type: MetricType.GAUGE,
      description: 'Requests per second',
      dimensions: [],
    },
    
    CAPACITY: {
      name: 'system.capacity',
      type: MetricType.GAUGE,
      description: 'Current capacity setting',
      dimensions: [],
    },
    CAPACITY_UTILIZATION: {
      name: 'system.capacity_utilization',
      type: MetricType.GAUGE,
      description: 'Current capacity utilization (%)',
      dimensions: [],
    },
    MAX_CAPACITY: {
      name: 'system.max_capacity',
      type: MetricType.GAUGE,
      description: 'Maximum capacity setting',
      dimensions: [],
    },
    GROUP_ACTIVE_REQUESTS: {
      name: 'system.group_active_requests',
      type: MetricType.GAUGE,
      description: 'Active requests per group',
      dimensions: [DimensionKey.GROUP_KEY],
    },

    
    UPTIME: {
      name: 'system.uptime',
      type: MetricType.GAUGE,
      description: 'System uptime in seconds',
      dimensions: [],
    },
    
    EVENT_LOOP_LAG: {
      name: 'system.event_loop_lag',
      type: MetricType.GAUGE,
      description: 'Event loop lag in ms',
      dimensions: [],
    },
    
    MEMORY_LEAK_INDICATORS: {
      name: 'system.memory_leak_indicators',
      type: MetricType.GAUGE,
      description: 'Memory growth indicators',
      dimensions: [],
    },
    
    RESTART_COUNT: {
      name: 'system.restart_count',
      type: MetricType.COUNTER,
      description: 'System restart count',
      dimensions: [DimensionKey.REASON],
    },
    CPU_LOAD_1M: {
      name: 'system.cpu_load_1m',
      type: MetricType.GAUGE,
      description: 'CPU load average (1 minute)',
      dimensions: [],
    },
    CPU_LOAD_5M: {
      name: 'system.cpu_load_5m',
      type: MetricType.GAUGE,
      description: 'CPU load average (5 minutes)',
      dimensions: [],
    },
    CPU_LOAD_15M: {
      name: 'system.cpu_load_15m',
      type: MetricType.GAUGE,
      description: 'CPU load average (15 minutes)',
      dimensions: [],
    },
    MEMORY_TOTAL: {  
      name: 'system.memory_total',
      type: MetricType.GAUGE,
      description: 'Total system memory in bytes',
      dimensions: [],
    },
    MEMORY_USED: {
      name: 'system.memory_used',
      type: MetricType.GAUGE,
      description: 'Used system memory in bytes',
      dimensions: [],
    },
    MEMORY_FREE: {
      name: 'system.memory_free',
      type: MetricType.GAUGE,
      description: 'Free system memory in bytes',
      dimensions: [],
    },
    MEMORY_USAGE_PCT: {
      name: 'system.memory_usage_pct',
      type: MetricType.GAUGE,
      description: 'Memory usage percentage (%)',
      dimensions: [],
    },
    PROCESS_MEMORY_RSS: {
      name: 'system.process_memory_rss',
      type: MetricType.GAUGE,
      description: 'Process memory usage (RSS) in bytes',
      dimensions: [],
    },
    PROCESS_MEMORY_HEAP_TOTAL: {
      name: 'system.process_memory_heap_total',
      type: MetricType.GAUGE,
      description: 'Total heap memory allocated in bytes',
      dimensions: [],
    },
    PROCESS_MEMORY_HEAP_USED: {
      name: 'system.process_memory_heap_used',
      type: MetricType.GAUGE,
      description: 'Used heap memory in bytes',
      dimensions: [],
    },
    

  };
  
  /**
   * Group Metrics (Enhanced Legacy Support)
   */
  export const GroupMetrics = {
    SUCCESS_RATE: {
      name: 'group.success_rate',
      type: MetricType.GAUGE,
      description: 'Success rate by group (%)',
      dimensions: [DimensionKey.GROUP_KEY, DimensionKey.ORG_ID],
    },
    
    ERROR_TYPES: {
      name: 'group.error_types',
      type: MetricType.COUNTER,
      description: 'Error distribution by group',
      dimensions: [DimensionKey.GROUP_KEY, DimensionKey.STATUS_CATEGORY],
    },
    
    RETRY_EFFECTIVENESS: {
      name: 'group.retry_effectiveness',
      type: MetricType.GAUGE,
      description: 'Retry success rate by group (%)',
      dimensions: [DimensionKey.GROUP_KEY],
    },
    
    THROUGHPUT: {
      name: 'group.throughput',
      type: MetricType.GAUGE,
      description: 'Requests per second by group',
      dimensions: [DimensionKey.GROUP_KEY],
    },
    
    COOLDOWN_FREQUENCY: {
      name: 'group.cooldown_frequency',
      type: MetricType.GAUGE,
      description: 'Cooldown frequency',
      dimensions: [DimensionKey.GROUP_KEY, 'timeWindow'],
    },
    
    COOLDOWN_REASONS: {
      name: 'group.cooldown_reasons',
      type: MetricType.COUNTER,
      description: 'Cooldown reason distribution',
      dimensions: [DimensionKey.GROUP_KEY, DimensionKey.REASON],
    },
    
    AVG_RESPONSE_TIME: {
      name: 'group.avg_response_time',
      type: MetricType.GAUGE,
      description: 'Average response time trend',
      dimensions: [DimensionKey.GROUP_KEY],
    },
    
    REQUEST_VOLUME_TREND: {
      name: 'group.request_volume_trend',
      type: MetricType.GAUGE,
      description: 'Request volume trend',
      dimensions: [DimensionKey.GROUP_KEY],
    },
  };
  
  /**
   * Dead Letter Metrics (Future)
   */
  export const DeadLetterMetrics = {
    ADDED: {
      name: 'deadletter.added',
      type: MetricType.COUNTER,
      description: 'Items added to dead letter',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.REASON],
    },
    
    COUNT: {
      name: 'deadletter.count',
      type: MetricType.GAUGE,
      description: 'Current dead letter count',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    AGE: {
      name: 'deadletter.age',
      type: MetricType.HISTOGRAM,
      description: 'Age distribution of dead letters',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    REPLAYED: {
      name: 'deadletter.replayed',
      type: MetricType.COUNTER,
      description: 'Replayed dead letter count',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    REPLAY_SUCCESS: {
      name: 'deadletter.replay_success',
      type: MetricType.COUNTER,
      description: 'Successful dead letter replays',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY],
    },
    
    PERMANENT_FAILURES: {
      name: 'deadletter.permanent_failures',
      type: MetricType.COUNTER,
      description: 'Permanently failed requests',
      dimensions: [DimensionKey.ORG_ID, DimensionKey.GROUP_KEY, DimensionKey.REASON],
    },
  };
  
  /**
   * Export all metrics by category
   */
  export const Metrics = {
    Request: RequestMetrics,
    Throttle: ThrottleMetrics,
    CircuitBreaker: CircuitBreakerMetrics,
    Queue: QueueMetrics,
    Retry: RetryMetrics,
    Downstream: DownstreamMetrics,
    System: SystemMetrics,
    Group: GroupMetrics,
    DeadLetter: DeadLetterMetrics,
    Connection: ConnectionMetrics,
  };
  
  /**
   * Convert a metric name to its definition
   * @param name The metric name to lookup
   * @returns The metric definition or undefined if not found
   */
  export function getMetricDefinition(name: string): any | undefined {
    // Search through all metric categories
    for (const category of Object.values(Metrics)) {
      for (const metric of Object.values(category)) {
        if ((metric as any).name === name) {
          return metric;
        }
      }
    }
    return undefined;
  }
  
  /**
   * Get all metrics of a specific type
   * @param type The metric type to filter by
   * @returns An array of metrics of the specified type
   */
  export function getMetricsByType(type: MetricType): any[] {
    const result: any[] = [];
    
    // Gather metrics of the specified type from all categories
    for (const category of Object.values(Metrics)) {
      for (const metric of Object.values(category)) {
        if ((metric as any).type === type) {
          result.push(metric);
        }
      }
    }
    
    return result;
  }
  
  /**
   * Get all metrics in a specific category
   * @param category The category name
   * @returns An array of metrics in the specified category
   */
  export function getMetricsByCategory(category: string): any[] {
    const categoryMetrics = (Metrics as any)[category];
    return categoryMetrics ? Object.values(categoryMetrics) : [];
  }