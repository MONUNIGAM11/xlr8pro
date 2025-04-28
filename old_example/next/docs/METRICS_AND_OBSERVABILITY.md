# xlr8plus Metrics & Observability System: Comprehensive Blueprint

## 1. Introduction & Architecture

The xlr8plus Metrics & Observability System provides comprehensive monitoring, analysis, and visualization capabilities for the xlr8plus asynchronous offload proxy. This document outlines the architecture, components, data model, and implementation strategy for the system.

### 1.1 Goals & Design Principles

- **Complete Coverage**: Monitor every aspect of the request lifecycle
- **Low Overhead**: Minimal impact on core system performance
- **Historical Analysis**: Store and analyze historical trends
- **Actionable Insights**: Provide operational intelligence
- **Dashboard Integration**: Power intuitive visualizations
- **Extensibility**: Allow for future analytics expansion

### 1.2 High-Level Architecture

```ascii
┌──────────────────┐     ┌─────────────────────┐     ┌──────────────────────┐
│                  │     │                     │     │                      │
│  Event-Based     │────▶│  Metrics Collection │────▶│  Storage & Retention │
│  Collection      │     │  & Processing       │     │                      │
│                  │     │                     │     │                      │
└──────────────────┘     └─────────────────────┘     └──────────────────────┘
         │                        │                            │
         │                        │                            │
         ▼                        ▼                            ▼
┌──────────────────┐     ┌─────────────────────┐     ┌──────────────────────┐
│                  │     │                     │     │                      │
│  API Layer &     │◀────│  Analytics Engine   │◀────│  Aggregation &       │
│  Endpoints       │     │                     │     │  Downsampling        │
│                  │     │                     │     │                      │
└──────────────────┘     └─────────────────────┘     └──────────────────────┘
         │                        │
         │                        │
         ▼                        ▼
┌──────────────────┐     ┌─────────────────────┐
│                  │     │                     │
│  Dashboard       │     │  Alerting &         │
│  Integration     │     │  Notification       │
│                  │     │                     │
└──────────────────┘     └─────────────────────┘
```

## 2. Core Components

### 2.1 Event-Based Collection

The metrics system leverages xlr8plus's event-driven architecture to collect metrics without impacting core functionality.

```typescript
export class MetricsEventListener {
  constructor(
    private eventBus: EventBus,
    private metricsRepository: MetricsRepository
  ) {
    // Register for all relevant events
    this.eventBus.subscribe(EventType.REQUEST_RECEIVED, this.handleRequestReceived.bind(this));
    this.eventBus.subscribe(EventType.REQUEST_VALIDATED, this.handleRequestValidated.bind(this));
    this.eventBus.subscribe(EventType.REQUEST_ACCEPTED, this.handleRequestAccepted.bind(this));
    this.eventBus.subscribe(EventType.REQUEST_FORWARDED, this.handleRequestForwarded.bind(this));
    this.eventBus.subscribe(EventType.RESPONSE_RECEIVED, this.handleResponseReceived.bind(this));
    this.eventBus.subscribe(EventType.RETRY_SCHEDULED, this.handleRetryScheduled.bind(this));
    this.eventBus.subscribe(EventType.REQUEST_COMPLETED, this.handleRequestCompleted.bind(this));
    this.eventBus.subscribe(EventType.REQUEST_FAILED, this.handleRequestFailed.bind(this));
    this.eventBus.subscribe(EventType.COOLDOWN_ACTIVATED, this.handleCooldownActivated.bind(this));
    this.eventBus.subscribe(EventType.COOLDOWN_EXPIRED, this.handleCooldownExpired.bind(this));
    this.eventBus.subscribe(EventType.RATE_LIMITED, this.handleRateLimited.bind(this));
    this.eventBus.subscribe(EventType.CAPACITY_UPDATED, this.handleCapacityUpdated.bind(this));
    // Future events
    // this.eventBus.subscribe(EventType.DEADLETTER_ADDED, this.handleDeadletterAdded.bind(this));
  }
  
  // Event handler implementations
  private handleRequestReceived(event: Event) {
    const { requestId, groupKey, orgId } = event;
    this.metricsRepository.incrementCounter('requests.received', 1, { 
      groupKey, 
      orgId 
    });
  }
  
  // Additional handlers...
}
```

### 2.2 Metrics Repository

The metrics repository provides a unified interface for recording and retrieving metrics.

```typescript
export interface MetricsRepository {
  // Counter methods
  incrementCounter(name: string, value: number, dimensions?: Record<string, string>): void;
  getCounter(name: string, dimensions?: Record<string, string>): number;
  
  // Gauge methods
  recordGauge(name: string, value: number, dimensions?: Record<string, string>): void;
  getGauge(name: string, dimensions?: Record<string, string>): number;
  
  // Timer methods
  recordTiming(name: string, durationMs: number, dimensions?: Record<string, string>): void;
  getTimingStats(name: string, dimensions?: Record<string, string>): {
    avg: number;
    min: number;
    max: number;
    p95: number;
    p99: number;
  };
  
  // Histogram methods
  recordHistogram(name: string, value: number, dimensions?: Record<string, string>): void;
  getHistogramStats(name: string, dimensions?: Record<string, string>): {
    avg: number;
    min: number;
    max: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  
  // Time series methods
  getTimeSeries(name: string, dimensions: Record<string, string>, start: Date, end: Date): Array<{
    timestamp: Date;
    value: number;
  }>;
}
```

### 2.3 Hybrid Storage Strategy

A hybrid approach combines in-memory storage for recent data with MongoDB persistence for historical data:

```typescript
export class HybridMetricsRepository implements MetricsRepository {
  constructor(
    private memoryStore: InMemoryMetricsStore,
    private mongoStore: MongoMetricsStore,
    private options: {
      flushInterval: number; // How often to flush to MongoDB
      retentionPeriod: number; // How long to keep data in memory
    }
  ) {
    // Set up periodic flush to MongoDB
    setInterval(() => this.flushToMongo(), this.options.flushInterval);
    // Set up memory cleanup
    setInterval(() => this.cleanupMemory(), this.options.retentionPeriod);
  }
  
  // Implementation of repository methods...
  
  private async flushToMongo(): Promise<void> {
    const batchData = this.memoryStore.prepareForBatch();
    if (batchData.length > 0) {
      await this.mongoStore.batchWrite(batchData);
    }
  }
  
  private cleanupMemory(): void {
    this.memoryStore.cleanupOldData(this.options.retentionPeriod);
  }
}
```

### 2.4 Periodic State Collection

In addition to event-based collection, some metrics require periodic state sampling:

```typescript
export class MetricsStateCollector {
  constructor(
    private requestRepository: RequestRepository,
    private groupRepository: GroupRepository,
    private metricsRepository: MetricsRepository
  ) {
    // Set up periodic collection
    setInterval(this.collectSystemState.bind(this), 10000); // Every 10 seconds
    setInterval(this.collectGroupMetrics.bind(this), 15000); // Every 15 seconds
  }
  
  private collectSystemState(): void {
    // Get active request count
    const activeRequests = this.requestRepository.getTotalActiveRequestCount();
    this.metricsRepository.recordGauge('system.active_requests', activeRequests);
    
    // Get groups in cooldown
    const cooldownGroups = this.groupRepository.getGroupsInCooldown().length;
    this.metricsRepository.recordGauge('system.cooldown_groups', cooldownGroups);
    
    // Get system resource utilization
    const memoryUsage = process.memoryUsage().heapUsed / process.memoryUsage().heapTotal;
    this.metricsRepository.recordGauge('system.memory_usage', memoryUsage);
  }
  
  private collectGroupMetrics(): void {
    const activeGroups = this.groupRepository.getActiveGroups();
    
    for (const group of activeGroups) {
      // Record active requests per group
      this.metricsRepository.recordGauge('group.active_requests', group.activeRequestCount, {
        groupKey: group.key
      });
      
      // Record pending requests in different states
      const pendingCount = this.requestRepository.getPendingCountForGroup(group.key);
      this.metricsRepository.recordGauge('group.pending_requests', pendingCount, {
        groupKey: group.key
      });
    }
  }
}
```

### 2.5 Analytics Engine

The analytics engine processes metrics to derive insights:

```typescript
export class MetricsAnalyticsEngine {
  constructor(
    private metricsRepository: MetricsRepository,
    private options: {
      anomalyThreshold: number;
      patternDetectionWindow: number;
    }
  ) {}
  
  async detectAnomalies(metricName: string, dimensions: Record<string, string>): Promise<any[]> {
    // Fetch historical data
    const now = new Date();
    const timeWindow = 24 * 60 * 60 * 1000; // 24 hours
    const historicalData = await this.metricsRepository.getTimeSeries(
      metricName,
      dimensions,
      new Date(now.getTime() - timeWindow),
      now
    );
    
    // Calculate baseline statistics
    const values = historicalData.map(point => point.value);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
    );
    
    // Identify anomalies
    return historicalData.filter(point => {
      const deviation = Math.abs(point.value - mean) / stdDev;
      return deviation > this.options.anomalyThreshold;
    });
  }
  
  // Additional analytics methods...
}
```

## 3. Metrics Catalog

### 3.1 Request Lifecycle Metrics

#### 3.1.1 Volume & Flow Metrics

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `request.received` | Counter | orgId, groupKey | Total incoming requests |
| `request.accepted` | Counter | orgId, groupKey | Requests accepted for processing |
| `request.validated` | Counter | orgId, groupKey | Requests passing validation |
| `request.forwarded` | Counter | orgId, groupKey, hostname | Requests forwarded to target |
| `request.completed` | Counter | orgId, groupKey, statusCode | Successfully completed requests |
| `request.failed` | Counter | orgId, groupKey, errorType | Failed requests |

#### 3.1.2 Timing Metrics

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `request.validation_time` | Timer | orgId, groupKey | Time spent in validation |
| `request.queue_time` | Timer | orgId, groupKey | Time spent in queue before forwarding |
| `request.response_time` | Timer | orgId, groupKey, hostname | Upstream service response time |
| `request.total_time` | Timer | orgId, groupKey | End-to-end processing time |
| `request.retry_delay` | Timer | orgId, groupKey, attemptCount | Time between retry attempts |

### 3.2 Throttling & Rate Limiting Metrics

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `throttle.rejected` | Counter | orgId, groupKey, reason | Rejected due to throttling |
| `throttle.delayed` | Counter | orgId, groupKey, reason | Delayed due to throttling |
| `cooldown.activated` | Counter | orgId, groupKey, reason | Cooldown activations |
| `cooldown.duration` | Histogram | orgId, groupKey, reason | Cooldown duration distribution |
| `cooldown.active_time` | Timer | orgId, groupKey | Total time in cooldown state |
| `capacity.level` | Gauge | - | Current system capacity level |
| `capacity.utilization` | Gauge | - | Current capacity utilization (%) |

### 3.3 Circuit Breaker Metrics

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `circuit.open` | Counter | orgId, groupKey, reason | Circuit open events |
| `circuit.close` | Counter | orgId, groupKey | Circuit close events |
| `circuit.status` | Gauge | orgId, groupKey | Current circuit status (0=closed, 1=open) |
| `circuit.open_time` | Timer | orgId, groupKey | Time spent in open state |
| `circuit.failure_count` | Gauge | orgId, groupKey | Current failure count |
| `circuit.threshold` | Gauge | orgId, groupKey | Current failure threshold |

### 3.4 Queue & Backpressure Metrics

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `queue.depth` | Gauge | orgId, groupKey | Current queue depth |
| `queue.pending` | Gauge | orgId, groupKey | Pending requests count |
| `queue.delayed` | Gauge | orgId, groupKey | Delayed requests count |
| `queue.waiting_retry` | Gauge | orgId, groupKey | Requests waiting for retry |
| `queue.growth_rate` | Gauge | orgId, groupKey | Queue growth rate (req/sec) |
| `system.load` | Gauge | - | System load factor |
| `system.memory` | Gauge | - | Memory utilization (%) |
| `system.rejection_rate` | Gauge | reason | Rate of rejected requests (req/sec) |

### 3.5 Retry & Error Metrics

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `retry.attempts` | Counter | orgId, groupKey, attemptNumber | Retry attempts by number |
| `retry.max_reached` | Counter | orgId, groupKey | Max retry attempts reached |
| `retry.success` | Counter | orgId, groupKey, originalStatus | Successful retries |
| `retry.failure` | Counter | orgId, groupKey, finalStatus | Failed retries |
| `error.count` | Counter | orgId, groupKey, statusCode, category | Errors by status |
| `error.rate` | Gauge | orgId, groupKey | Error rate (%) |

### 3.6 Downstream Service Metrics

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `downstream.response_time` | Timer | hostname, endpoint | Service response time |
| `downstream.error_rate` | Gauge | hostname, endpoint | Service error rate (%) |
| `downstream.status` | Counter | hostname, statusCode | Status code distribution |
| `downstream.retry_rate` | Gauge | hostname | Retry rate per service (%) |
| `downstream.throughput` | Gauge | hostname, endpoint | Requests per second |

### 3.7 System Health Metrics

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `system.active_requests` | Gauge | - | Current active requests |
| `system.active_groups` | Gauge | - | Active request groups |
| `system.cooldown_groups` | Gauge | - | Groups in cooldown |
| `system.success_rate` | Gauge | - | Overall success rate (%) |
| `system.throughput` | Gauge | - | Requests per second |
| `system.capacity` | Gauge | - | Current capacity setting |

### 3.8 Dead Letter Metrics (Future)

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `deadletter.added` | Counter | orgId, groupKey, reason | Items added to dead letter |
| `deadletter.count` | Gauge | orgId, groupKey | Current dead letter count |
| `deadletter.age` | Histogram | orgId, groupKey | Age distribution of dead letters |
| `deadletter.replayed` | Counter | orgId, groupKey | Replayed dead letter count |
| `deadletter.replay_success` | Counter | orgId, groupKey | Successful dead letter replays |

## 4. API Endpoints

### 4.1 Core Operational Endpoints

#### 4.1.1 `/metrics/summary`

**Purpose**: Overall system status and health

**Response Example**:
```json
{
  "timestamp": "2023-06-01T12:00:00Z",
  "counters": {
    "totalRequests": 1250345,
    "successfulRequests": 1210822,
    "failedRequests": 39523,
    "retryAttempts": 42891,
    "rateLimitHits": 7235,
    "cooldownActivations": 312
  },
  "current": {
    "activeRequests": 4728,
    "activeRequestGroups": 87,
    "cooldownGroups": 5,
    "systemLoad": 0.72,
    "capacityUtilization": 0.65
  },
  "successRate": "96.84%",
  "cooldownGroups": [
    {
      "key": "org123:api:example.com",
      "remainingTime": 35000,
      "reason": "FAILURE_THRESHOLD_EXCEEDED",
      "failureCount": 28
    }
  ]
}
```

#### 4.1.2 `/metrics/groups`

**Purpose**: Per-group performance analytics

**Response Example**:
```json
{
  "timestamp": "2023-06-01T12:00:00Z",
  "groups": [
    {
      "key": "org123:api:example.com",
      "current": {
        "success": 192,
        "failure": 28,
        "inCooldown": true,
        "cooldownRemaining": 35000,
        "activeRequests": 42
      },
      "aggregate": {
        "total": 15234,
        "success": 14892,
        "failure": 342,
        "retries": 421,
        "cooldowns": 3,
        "maxRetryReached": 18
      },
      "successRate": "97.75%",
      "avgResponseTime": "342ms",
      "queueDepth": {
        "accepted": 12,
        "delayed": 8,
        "waitingRetry": 22
      },
      "throttling": {
        "totalThrottled": 187,
        "reasonDistribution": {
          "GROUP_COOLDOWN": 42,
          "GROUP_LIMIT_EXCEEDED": 98,
          "GLOBAL_CAPACITY_EXCEEDED": 47
        }
      }
    }
  ]
}
```

#### 4.1.3 `/metrics/historical?timeframe=1h&metric=activeRequests`

**Purpose**: Time-series data for charts

**Response Example**:
```json
{
  "timeframe": "1h",
  "metric": "activeRequests",
  "resolution": "1m",
  "points": [
    {"timestamp": "2023-06-01T11:01:00Z", "value": 4372},
    {"timestamp": "2023-06-01T11:02:00Z", "value": 4531},
    {"timestamp": "2023-06-01T12:00:00Z", "value": 4728}
  ]
}
```

#### 4.1.4 `/metrics/status`

**Purpose**: Error and status code distribution

**Response Example**:
```json
{
  "timestamp": "2023-06-01T12:00:00Z",
  "byCode": {
    "200": 987342,
    "201": 2341,
    "400": 5423,
    "401": 123,
    "429": 7235,
    "500": 15234,
    "502": 5623,
    "503": 2341
  },
  "byCategory": {
    "http_success": 990250,
    "http_auth_failure": 575,
    "http_rate_limit": 7235,
    "http_client_error": 6875,
    "http_server_error": 15234,
    "http_gateway_error": 6858,
    "http_service_unavailable": 2341
  },
  "retryEffectiveness": {
    "byCategory": {
      "http_rate_limit": "87.2%",
      "http_server_error": "65.3%",
      "http_gateway_error": "82.1%",
      "http_service_unavailable": "91.4%"
    }
  }
}
```

### 4.2 Advanced Analytics Endpoints

#### 4.2.1 `/metrics/hotspots`

**Purpose**: Identify abnormal group behavior

**Response Example**:
```json
{
  "timestamp": "2023-06-01T12:00:00Z",
  "hotGroups": [
    {
      "key": "org456:chat:api.example.org",
      "score": 0.92,
      "metrics": {
        "requestVolume": {
          "value": 4532,
          "percentile": 98.5,
          "trend": "+132% over baseline"
        },
        "errorRate": {
          "value": "12.3%",
          "percentile": 97.2,
          "baseline": "2.1%"
        },
        "avgResponseTime": {
          "value": "2345ms",
          "percentile": 99.1,
          "baseline": "345ms"
        }
      },
      "anomalies": [
        "Sudden error rate increase at 11:42",
        "Response time spike beginning at 11:35"
      ]
    }
  ]
}
```

#### 4.2.2 `/metrics/patterns?groupKey=org123:api:example.com&pattern=daily`

**Purpose**: Pattern detection and cyclical analysis

**Response Example**:
```json
{
  "groupKey": "org123:api:example.com",
  "patternType": "daily",
  "requestVolume": {
    "hourlyPattern": [
      {"hour": 0, "avgVolume": 1234, "peakVolume": 1532},
      {"hour": 1, "avgVolume": 956, "peakVolume": 1211},
      {"hour": 23, "avgVolume": 1432, "peakVolume": 1687}
    ],
    "peakHours": [9, 13, 16],
    "lowHours": [2, 3, 4],
    "confidenceScore": 0.87
  },
  "errorRate": {
    "hourlyPattern": [
      {"hour": 0, "avgRate": "1.2%", "peakRate": "2.1%"}
    ],
    "peakHours": [2, 14],
    "correlation": {
      "withVolume": -0.12,
      "withResponseTime": 0.67
    }
  }
}
```

#### 4.2.3 `/metrics/downstream?hostname=api.example.com`

**Purpose**: Downstream service health metrics

**Response Example**:
```json
{
  "hostname": "api.example.com",
  "summary": {
    "requestVolume": 132456,
    "successRate": "94.3%",
    "avgResponseTime": "456ms",
    "p95ResponseTime": "1232ms",
    "availabilityScore": 0.992
  },
  "endpoints": [
    {
      "path": "/v1/users",
      "requestVolume": 34521,
      "successRate": "99.2%",
      "avgResponseTime": "234ms"
    }
  ],
  "statusDistribution": {
    "200": 124532,
    "429": 3245,
    "500": 3212
  },
  "retryStats": {
    "retryRate": "5.7%",
    "recoverySuccess": "82.4%",
    "avgAttemptsNeeded": 1.3
  },
  "anomalies": [
    {
      "type": "LATENCY_SPIKE",
      "timestamp": "2023-06-01T11:32:00Z",
      "duration": "15m",
      "magnitude": "+430%"
    }
  ]
}
```

#### 4.2.4 `/metrics/capacity`

**Purpose**: System capacity and backpressure metrics

**Response Example**:
```json
{
  "timestamp": "2023-06-01T12:00:00Z",
  "current": {
    "systemLoad": 0.72,
    "memoryUsage": 0.65,
    "cpuLoad": 0.78,
    "activeRequests": 4728,
    "configuredCapacity": 7500,
    "adjustedCapacity": 6500,
    "capacityUtilization": 0.73
  },
  "throttling": {
    "current": {
      "totalThrottled": 423,
      "byReason": {
        "GROUP_COOLDOWN": 45,
        "GROUP_LIMIT_EXCEEDED": 243,
        "GLOBAL_CAPACITY_EXCEEDED": 135
      }
    },
    "historical": [
      {"timestamp": "2023-06-01T11:00:00Z", "total": 312},
      {"timestamp": "2023-06-01T11:15:00Z", "total": 356}
    ]
  },
  "queueDepth": {
    "accepted": 2341,
    "delayed": 1245,
    "waitingRetry": 1142,
    "trend": "+12% in last 15m"
  },
  "latencyCorrelation": {
    "withLoad": 0.87,
    "withQueueDepth": 0.92
  }
}
```

## 5. Data Storage Model

### 5.1 In-Memory Data Structures

#### 5.1.1 Circular Buffer
```typescript
class CircularBuffer<T> {
  private buffer: T[];
  private currentIndex: number = 0;
  private isFull: boolean = false;
  
  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }
  
  add(item: T): void {
    this.buffer[this.currentIndex] = item;
    this.currentIndex = (this.currentIndex + 1) % this.capacity;
    if (!this.isFull && this.currentIndex === 0) this.isFull = true;
  }
  
  getAll(): T[] {
    if (!this.isFull) {
      return this.buffer.slice(0, this.currentIndex);
    }
    return [
      ...this.buffer.slice(this.currentIndex),
      ...this.buffer.slice(0, this.currentIndex)
    ];
  }
  
  getRecentPoints(minutes: number): T[] {
    // Return points from the last N minutes
    const cutoffTime = Date.now() - (minutes * 60 * 1000);
    return this.getAll().filter(point => 
      (point as any).timestamp >= cutoffTime
    );
  }
}
```

#### 5.1.2 Dimensional Counter
```typescript
class DimensionalCounter {
  private counters: Map<string, number> = new Map();
  
  increment(dimensions: Record<string, string>, value: number = 1): void {
    const key = this.dimensionsToKey(dimensions);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }
  
  get(dimensions: Record<string, string>): number {
    const key = this.dimensionsToKey(dimensions);
    return this.counters.get(key) || 0;
  }
  
  getAll(): Array<{ dimensions: Record<string, string>, value: number }> {
    return Array.from(this.counters.entries()).map(([key, value]) => ({
      dimensions: this.keyToDimensions(key),
      value
    }));
  }
  
  private dimensionsToKey(dimensions: Record<string, string>): string {
    return Object.entries(dimensions)
      .sort(([k1], [k2]) => k1.localeCompare(k2))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
  }
  
  private keyToDimensions(key: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (key === '') return result;
    
    key.split(',').forEach(pair => {
      const [k, v] = pair.split(':');
      result[k] = v;
    });
    
    return result;
  }
}
```

### 5.2 MongoDB Schema

#### 5.2.1 Raw Metrics Document
```typescript
interface MetricDocument {
  _id: ObjectId;
  name: string;            // Metric name
  type: string;            // counter, gauge, timing, etc.
  value: number;           // Numeric value
  dimensions: {            // Dimensions for filtering/grouping
    groupKey?: string;
    orgId?: string;
    statusCode?: string;
    hostname?: string;
    endpoint?: string;
    [key: string]: string; // Other dimensions
  };
  timestamp: Date;         // When the metric was recorded
}
```

#### 5.2.2 Aggregated Metrics Document
```typescript
interface AggregatedMetricDocument {
  _id: ObjectId;
  name: string;            // Metric name
  period: {
    start: Date;           // Start of aggregation period
    end: Date;             // End of aggregation period
    duration: string;      // 1m, 1h, 1d, etc.
  };
  dimensions: {            // Dimensions for filtering/grouping
    groupKey?: string;
    orgId?: string;
    // Other dimensions
  };
  values: {                // Statistical aggregations
    count: number;
    sum: number;
    min: number;
    max: number;
    avg: number;
    p50?: number;          // Optional percentiles
    p90?: number;
    p95?: number;
    p99?: number;
  };
}
```

## 6. Implementation Strategy

### 6.1 Phased Rollout Plan

#### Phase 1: Core Metrics Foundation (Weeks 1-3)
- Implement `MetricsEventListener` for event-based collection
- Develop in-memory storage with `CircularBuffer` and `DimensionalCounter`
- Create MongoDB schema and basic repository
- Implement compatibility layer for legacy dashboard endpoints
- Unit tests and integration tests

#### Phase 2: Operational Metrics (Weeks 4-7)
- Implement periodic state collection
- Add queue depth and backpressure metrics
- Enhance error tracking and categorization
- Add cooldown and circuit breaker metrics
- Implement advanced group metrics
- End-to-end tests

#### Phase 3: Advanced Analytics (Weeks 8-12)
- Implement analytics engine for pattern detection
- Develop anomaly detection algorithms
- Create hot spot identification
- Implement downstream service health metrics
- Add correlation analysis
- Performance testing

#### Phase 4: Intelligence & Alerting (Weeks 13-16)
- Implement configurable alerting
- Develop notification service
- Create machine learning-based predictions
- Add business intelligence metrics
- Integrate with external monitoring systems
- Load testing and stability validation

### 6.2 Deployment Considerations

- Ensure indexes are created for MongoDB collections
- Set up TTL indexes for automatic data aging
- Configure appropriate batch sizes for MongoDB writes
- Implement circuit breakers for metrics database
- Ensure metrics collection degrades gracefully under pressure
- Implement sampling for high-volume periods

### 6.3 Dashboard Integration

- Maintain compatibility with existing dashboard components
- Enhance dashboard with new metrics
- Add drill-down capabilities
- Create specialized views for different user roles
- Implement real-time updates for critical metrics

## 7. Success Criteria & Expected Outcomes

### 7.1 Performance Targets
- Metrics collection overhead < 5% of system resources
- MongoDB batch write latency < 100ms
- Dashboard rendering time < 1s for main views
- Support for 3M+ requests per hour with accurate metrics

### 7.2 Operational Benefits
- Early detection of abnormal behavior
- Precise identification of bottlenecks
- Clear visibility into cooldown activations and reasons
- Accurate capacity planning
- Improved downstream service monitoring

### 7.3 Key Metrics for Validation
- Request volume accuracy
- Response time precision
- Error tracking completeness
- Group activity monitoring
- Cooldown detection reliability

## 8. Future Enhancements

- Federated metrics across multiple xlr8plus instances
- Machine learning pipeline for predictive capacity management
- Automated remediation based on metrics
- Interactive query capability for custom metric exploration
- Export to external observability platforms (Grafana, Datadog, etc.)
- Metrics-driven auto-scaling




# xlr8plus Metrics & Observability System: Comprehensive Blueprint

## 1. Introduction & Architecture

The xlr8plus Metrics & Observability System provides comprehensive monitoring, analysis, and visualization capabilities for the xlr8plus asynchronous offload proxy. This blueprint ensures full backward compatibility with the legacy metrics system while leveraging the event-driven architecture of the next implementation to enable advanced analytics and insights.

### 1.1 Goals & Design Principles

- **Complete Coverage**: Monitor every aspect of the request lifecycle
- **Legacy Compatibility**: Maintain support for existing dashboard components
- **Low Overhead**: Minimal impact on core system performance
- **Dimensional Analysis**: Support multi-dimensional metrics for deeper insights
- **Historical Analysis**: Store and analyze historical trends
- **Actionable Insights**: Provide operational intelligence
- **Dashboard Integration**: Power intuitive visualizations
- **Extensibility**: Allow for future analytics expansion

### 1.2 High-Level Architecture

```ascii
┌──────────────────┐     ┌─────────────────────┐     ┌──────────────────────┐
│                  │     │                     │     │                      │
│  Event-Based     │────▶│  Metrics Collection │────▶│  Hybrid Storage      │
│  Collection      │     │  & Processing       │     │  (Memory + MongoDB)  │
│                  │     │                     │     │                      │
└──────────────────┘     └─────────────────────┘     └──────────────────────┘
         │                        │                            │
         │                        │                            │
         ▼                        ▼                            ▼
┌──────────────────┐     ┌─────────────────────┐     ┌──────────────────────┐
│                  │     │                     │     │                      │
│  Legacy API      │◀────│  Analytics Engine   │◀────│  Aggregation &       │
│  Compatibility   │     │                     │     │  Downsampling        │
│                  │     │                     │     │                      │
└──────────────────┘     └─────────────────────┘     └──────────────────────┘
         │                        │
         │                        │
         ▼                        ▼
┌──────────────────┐     ┌─────────────────────┐
│                  │     │                     │
│  Dashboard       │     │  Alerting &         │
│  Integration     │     │  Notification       │
│                  │     │                     │
└──────────────────┘     └─────────────────────┘
```

## 2. Legacy Implementation Analysis

### 2.1 Key Components of Legacy Metrics System

From analyzing `metricsService.js`, `metricsController.js`, and dashboard components:

#### 2.1.1 Core Data Structures

- **TimeSeriesMetrics**: Circular buffer implementation with fixed capacity (1440 data points, 24h at 1-min resolution)
- **Counter Maps**: Simple key-value stores tracking various request counters
- **Group Metrics**: Per-group aggregated metrics with success/failure counts

#### 2.1.2 Key Metrics Collected

- Request starts, completions, retries, and failures
- Rate limit hits and cooldown activations
- Success rates and response times
- Status code distribution

#### 2.1.3 API Endpoints

- `/metrics/summary`: Overall system status
- `/metrics/groups`: Group-specific metrics
- `/metrics/historical`: Time series for trending
- `/metrics/status`: Status code distribution

### 2.2 Improvements Over Legacy System

| Legacy Implementation | Next Implementation Enhancement |
|----------------------|--------------------------------|
| In-memory only storage | Hybrid storage with MongoDB persistence |
| Fixed 24h retention | Configurable retention with tiered storage |
| Manual metric recording | Event-driven automatic collection |
| Limited dimensions | Rich dimensional metrics |
| Basic time series (1-min resolution) | Multi-resolution time series (1s, 1m, 5m, 1h) |
| Simple success/failure | Detailed status category tracking |
| Basic throttling metrics | Comprehensive throttle and cooldown analytics |
| No anomaly detection | Built-in anomaly and pattern detection |

## 3. Core Components

### 3.1 Enhanced Memory Metrics Store

An improved version of the legacy TimeSeriesMetrics with better memory efficiency and dimensional support:

```typescript
export class MemoryMetricsStore {
  private counters: Map<string, DimensionalCounter> = new Map();
  private gauges: Map<string, DimensionalGauge> = new Map();
  private timers: Map<string, DimensionalTimer> = new Map();
  private timeSeries: Map<string, Map<string, CircularBuffer<TimePoint>>> = new Map();
  
  // Legacy compatibility methods
  recordRequestStart(requestId: string, requestGroupKey: string): void {
    this.incrementCounter('requests.started', 1, { groupKey: requestGroupKey });
    // Maintain legacy id-to-group mapping for compatibility
  }
  
  recordRequestCompletion(requestId: string, statusCode: number): void {
    // Legacy compatibility implementation that calls new dimensional methods
    this.incrementCounter('requests.completed', 1, { statusCode: statusCode.toString() });
    if (statusCode >= 200 && statusCode < 300) {
      this.incrementCounter('requests.successful', 1);
    } else {
      this.incrementCounter('requests.failed', 1);
    }
  }
  
  // New dimensional methods
  incrementCounter(name: string, value: number, dimensions?: Record<string, string>): void {
    if (!this.counters.has(name)) {
      this.counters.set(name, new DimensionalCounter());
    }
    
    this.counters.get(name)!.increment(dimensions || {}, value);
    
    // Also record in time series for this counter
    this.recordTimeSeriesPoint(name, value, dimensions);
  }
  
  recordGauge(name: string, value: number, dimensions?: Record<string, string>): void {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, new DimensionalGauge());
    }
    
    this.gauges.get(name)!.record(dimensions || {}, value);
    this.recordTimeSeriesPoint(name, value, dimensions);
  }
  
  recordTiming(name: string, valueMs: number, dimensions?: Record<string, string>): void {
    if (!this.timers.has(name)) {
      this.timers.set(name, new DimensionalTimer());
    }
    
    this.timers.get(name)!.record(dimensions || {}, valueMs);
    this.recordTimeSeriesPoint(name, valueMs, dimensions);
  }
  
  private recordTimeSeriesPoint(name: string, value: number, dimensions?: Record<string, string>): void {
    const dimensionKey = this.dimensionsToKey(dimensions || {});
    
    if (!this.timeSeries.has(name)) {
      this.timeSeries.set(name, new Map());
    }
    
    if (!this.timeSeries.get(name)!.has(dimensionKey)) {
      // Create time series with 1440 capacity (24h at 1-min resolution, matching legacy)
      this.timeSeries.get(name)!.set(dimensionKey, new CircularBuffer<TimePoint>(1440));
    }
    
    this.timeSeries.get(name)!.get(dimensionKey)!.add({
      timestamp: Date.now(),
      value
    });
  }
  
  // Methods to implement legacy API endpoints
  getSummaryMetrics(): Record<string, any> {
    // Return format matching legacy for dashboard compatibility
    return {
      timestamp: new Date().toISOString(),
      counters: {
        totalRequests: this.getCounter('requests.started'),
        successfulRequests: this.getCounter('requests.successful'),
        failedRequests: this.getCounter('requests.failed'),
        retryAttempts: this.getCounter('requests.retry'),
        rateLimitHits: this.getCounter('throttle.ratelimit'),
        cooldownActivations: this.getCounter('cooldown.activated')
      },
      current: {
        activeRequests: this.getGauge('system.active_requests'),
        activeRequestGroups: this.getGauge('system.active_groups'),
        cooldownGroups: this.getGauge('system.cooldown_groups'),
        systemLoad: this.getGauge('system.load')
      },
      // Calculate success rate
      successRate: this.calculateSuccessRate(),
      // Get cooldown groups
      cooldownGroups: this.getCooldownGroups()
    };
  }
  
  // Additional methods for legacy API compatibility...
  
  // Helper methods for dimensional support
  private dimensionsToKey(dimensions: Record<string, string>): string {
    return Object.entries(dimensions)
      .sort(([k1], [k2]) => k1.localeCompare(k2))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
  }
  
  // Method to prepare data for MongoDB batch write
  prepareForBatch(): Array<{name: string, type: string, value: number, dimensions: Record<string, string>, timestamp: Date}> {
    const batchData: Array<{name: string, type: string, value: number, dimensions: Record<string, string>, timestamp: Date}> = [];
    
    // Collect counter data
    for (const [name, counter] of this.counters.entries()) {
      for (const {dimensions, value} of counter.getAll()) {
        batchData.push({
          name,
          type: 'counter',
          value,
          dimensions,
          timestamp: new Date()
        });
      }
    }
    
    // Collect gauge data
    // ...similar implementation for gauges and timers
    
    return batchData;
  }
  
  // Clean up old data (reset counters that should be periodic)
  cleanupOldData(retentionPeriodMs: number): void {
    // Reset rate counters (requests per second, etc.)
    // Keep cumulative counters intact
  }
}
```

### 3.2 MongoDB Metrics Repository

```typescript
export class MongoMetricsRepository {
  constructor(private db: MongoDB.Db) {
    this.initializeCollections();
  }
  
  private async initializeCollections(): Promise<void> {
    // Create raw metrics collection with TTL index
    const rawMetrics = this.db.collection('raw_metrics');
    await rawMetrics.createIndex({ timestamp: 1 }, { 
      expireAfterSeconds: 7 * 24 * 60 * 60 // 7 days retention
    });
    await rawMetrics.createIndex({ name: 1, 'dimensions.groupKey': 1, timestamp: 1 });
    
    // Create aggregated metrics collection with TTL index
    const aggMetrics = this.db.collection('aggregated_metrics');
    await aggMetrics.createIndex({ 'period.end': 1 }, { 
      expireAfterSeconds: 90 * 24 * 60 * 60 // 90 days retention
    });
    await aggMetrics.createIndex({ name: 1, 'dimensions.groupKey': 1, 'period.start': 1 });
  }
  
  async batchWrite(metrics: Array<{name: string, type: string, value: number, dimensions: Record<string, string>, timestamp: Date}>): Promise<void> {
    if (metrics.length === 0) return;
    
    try {
      // Insert raw metrics
      await this.db.collection('raw_metrics').insertMany(metrics);
      
      // Schedule aggregation job (or trigger it directly for small batches)
      this.aggregateMetrics(metrics.map(m => m.name));
    } catch (error) {
      console.error('Error writing metrics batch to MongoDB:', error);
    }
  }
  
  private async aggregateMetrics(metricNames: string[]): Promise<void> {
    // Deduplicate metric names
    const uniqueNames = [...new Set(metricNames)];
    
    // For each unique metric name, run aggregation for different time windows
    for (const name of uniqueNames) {
      await this.aggregateMetricByTimeWindow(name, '5m'); // 5-minute aggregation
      await this.aggregateMetricByTimeWindow(name, '1h'); // 1-hour aggregation
      await this.aggregateMetricByTimeWindow(name, '1d'); // 1-day aggregation
    }
  }
  
  private async aggregateMetricByTimeWindow(name: string, window: string): Promise<void> {
    // Implementation of MongoDB aggregation pipeline to compute
    // statistics over the specified time window
    // ...
  }
  
  async queryTimeSeries(name: string, dimensions: Record<string, string>, start: Date, end: Date, resolution: string): Promise<TimePoint[]> {
    // Query appropriate collection based on the requested resolution
    // Use raw_metrics for fine-grained recent data
    // Use aggregated_metrics for historical data at lower resolution
    // ...
  }
  
  // Additional query methods...
}
```

### 3.3 Event-Based Collection

The event-driven architecture of the next implementation enables automatic metrics collection:

```typescript
export class MetricsEventListener {
  constructor(
    private eventBus: EventBus,
    private metricsRepository: MetricsRepository
  ) {
    // Subscribe to all relevant events
    this.subscribeToEvents();
  }
  
  private subscribeToEvents(): void {
    // Request lifecycle events
    this.eventBus.subscribe(EventType.REQUEST_RECEIVED, this.handleRequestReceived.bind(this));
    this.eventBus.subscribe(EventType.REQUEST_VALIDATED, this.handleRequestValidated.bind(this));
    this.eventBus.subscribe(EventType.REQUEST_ACCEPTED, this.handleRequestAccepted.bind(this));
    this.eventBus.subscribe(EventType.REQUEST_FORWARDED, this.handleRequestForwarded.bind(this));
    this.eventBus.subscribe(EventType.RESPONSE_RECEIVED, this.handleResponseReceived.bind(this));
    this.eventBus.subscribe(EventType.RETRY_SCHEDULED, this.handleRetryScheduled.bind(this));
    this.eventBus.subscribe(EventType.REQUEST_COMPLETED, this.handleRequestCompleted.bind(this));
    this.eventBus.subscribe(EventType.REQUEST_FAILED, this.handleRequestFailed.bind(this));
    
    // Throttling and cooldown events
    this.eventBus.subscribe(EventType.COOLDOWN_ACTIVATED, this.handleCooldownActivated.bind(this));
    this.eventBus.subscribe(EventType.COOLDOWN_EXPIRED, this.handleCooldownExpired.bind(this));
    this.eventBus.subscribe(EventType.RATE_LIMITED, this.handleRateLimited.bind(this));
    
    // System events
    this.eventBus.subscribe(EventType.CAPACITY_UPDATED, this.handleCapacityUpdated.bind(this));
    
    // Future events
    this.eventBus.subscribe(EventType.DEADLETTER_ADDED, this.handleDeadletterAdded.bind(this));
  }
  
  // Event handler implementations
  private handleRequestReceived(event: Event): void {
    const { requestId, groupKey, orgId } = event;
    
    // Record the event in metrics
    this.metricsRepository.incrementCounter('requests.received', 1, { 
      groupKey, 
      orgId 
    });
    
    // Track request start (legacy compatibility)
    this.metricsRepository.recordRequestStart(requestId, groupKey);
  }
  
  private handleResponseReceived(event: Event): void {
    const { requestId, groupKey, orgId, payload } = event;
    const { statusCode, responseTime, error } = payload;
    
    // Record status code distribution
    if (statusCode) {
      this.metricsRepository.incrementCounter('response.status', 1, {
        statusCode: statusCode.toString(),
        groupKey,
        orgId
      });
      
      // Record status category
      const category = StatusClassifier.classify(statusCode);
      this.metricsRepository.incrementCounter('response.category', 1, {
        category,
        groupKey,
        orgId
      });
    }
    
    // Record response time if available
    if (responseTime) {
      this.metricsRepository.recordTiming('response.time', responseTime, {
        groupKey,
        orgId,
        statusCode: statusCode ? statusCode.toString() : 'error'
      });
    }
    
    // Record error if present
    if (error) {
      this.metricsRepository.incrementCounter('response.error', 1, {
        errorType: error.code || 'unknown',
        groupKey,
        orgId
      });
    }
  }
  
  private handleCooldownActivated(event: Event): void {
    const { groupKey, payload } = event;
    const { durationMs, reason } = payload;
    
    // Record cooldown activation
    this.metricsRepository.incrementCounter('cooldown.activated', 1, {
      groupKey,
      reason: reason || 'unknown'
    });
    
    // Record cooldown duration as histogram
    this.metricsRepository.recordHistogram('cooldown.duration', durationMs, {
      groupKey,
      reason: reason || 'unknown'
    });
    
    // Update gauge of active cooldowns
    this.metricsRepository.incrementGauge('cooldown.active_count', 1, {
      groupKey
    });
  }
  
  // Additional event handlers...
}
```

### 3.4 MetricsQueryService

```typescript
export class MetricsQueryService {
  constructor(
    private memoryStore: MemoryMetricsStore,
    private mongoRepo: MongoMetricsRepository,
    private options: {
      recentDataThresholdMs: number;
    }
  ) {}
  
  async getTimeSeries(name: string, dimensions: Record<string, string>, start: Date, end: Date): Promise<TimePoint[]> {
    const now = new Date();
    const startTime = start.getTime();
    const endTime = end.getTime();
    
    // If all data is recent, use memory store only
    if (startTime >= now.getTime() - this.options.recentDataThresholdMs) {
      return this.memoryStore.getTimeSeries(name, dimensions, start, end);
    }
    
    // If all data is historical, use MongoDB only
    if (endTime < now.getTime() - this.options.recentDataThresholdMs) {
      return this.mongoRepo.queryTimeSeries(name, dimensions, start, end, this.selectResolution(start, end));
    }
    
    // Mixed case: fetch historical from MongoDB and recent from memory store
    const historicalEnd = new Date(now.getTime() - this.options.recentDataThresholdMs);
    
    const [historicalData, recentData] = await Promise.all([
      this.mongoRepo.queryTimeSeries(name, dimensions, start, historicalEnd, this.selectResolution(start, historicalEnd)),
      this.memoryStore.getTimeSeries(name, dimensions, historicalEnd, end)
    ]);
    
    // Merge and sort by timestamp
    return [...historicalData, ...recentData].sort((a, b) => a.timestamp - b.timestamp);
  }
  
  private selectResolution(start: Date, end: Date): string {
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    
    if (durationHours <= 6) return '1m';    // 1-minute resolution for <= 6 hours
    if (durationHours <= 48) return '5m';   // 5-minute resolution for <= 48 hours
    if (durationHours <= 168) return '1h';  // 1-hour resolution for <= 7 days
    return '1d';                            // 1-day resolution for > 7 days
  }
  
  // Legacy-compatible API methods
  async getSummaryMetrics(): Promise<Record<string, any>> {
    // For most summary metrics, we can use memory store directly
    // as they represent current state
    return this.memoryStore.getSummaryMetrics();
  }
  
  async getGroupMetrics(): Promise<Record<string, any>> {
    // For group metrics, we need to combine memory data with historical data
    // to get proper aggregate values
    // ...
  }
  
  // Additional query methods...
}
```

## 4. Enhanced Metrics Catalog

### 4.1 Request Lifecycle Metrics

#### 4.1.1 Volume & Flow Metrics

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `request.received` | Counter | orgId, groupKey | Total incoming requests |
| `request.accepted` | Counter | orgId, groupKey | Requests accepted for processing |
| `request.validated` | Counter | orgId, groupKey | Requests passing validation |
| `request.forwarded` | Counter | orgId, groupKey, hostname | Requests forwarded to target |
| `request.completed` | Counter | orgId, groupKey, statusCode | Successfully completed requests |
| `request.failed` | Counter | orgId, groupKey, errorType | Failed requests |
| `request.delayed` | Counter | orgId, groupKey, reason | Requests deliberately delayed |
| `request.retryable` | Counter | orgId, groupKey, statusCode | Requests eligible for retry |
| `request.non_retryable` | Counter | orgId, groupKey, statusCode | Requests not eligible for retry |

#### 4.1.2 Timing Metrics

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `request.validation_time` | Timer | orgId, groupKey | Time spent in validation |
| `request.queue_time` | Timer | orgId, groupKey | Time spent in queue before forwarding |
| `request.response_time` | Timer | orgId, groupKey, hostname, statusCode | Upstream service response time |
| `request.total_time` | Timer | orgId, groupKey | End-to-end processing time |
| `request.retry_delay` | Timer | orgId, groupKey, attemptCount | Time between retry attempts |
| `request.time_to_first_byte` | Timer | orgId, groupKey, hostname | Time to first byte from upstream |
| `request.processing_overhead` | Timer | orgId, groupKey | xlr8plus processing overhead |

### 4.2 Throttling & Rate Limiting Metrics

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `throttle.rejected` | Counter | orgId, groupKey, reason | Rejected due to throttling |
| `throttle.delayed` | Counter | orgId, groupKey, reason | Delayed due to throttling |
| `throttle.allowed_anyway` | Counter | orgId, groupKey, reason | Allowed despite throttling conditions |
| `cooldown.activated` | Counter | orgId, groupKey, reason | Cooldown activations |
| `cooldown.duration` | Histogram | orgId, groupKey, reason | Cooldown duration distribution |
| `cooldown.active_time` | Timer | orgId, groupKey | Total time in cooldown state |
| `cooldown.expired` | Counter | orgId, groupKey | Cooldown expiration events |
| `capacity.level` | Gauge | - | Current system capacity level |
| `capacity.utilization` | Gauge | - | Current capacity utilization (%) |
| `capacity.adjusted` | Counter | newLevel, oldLevel, reason | Capacity adjustment events |
| `throttle.reason_distribution` | Counter | reason | Distribution of throttle reasons |

### 4.3 Circuit Breaker Metrics

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `circuit.open` | Counter | orgId, groupKey, reason | Circuit open events |
| `circuit.close` | Counter | orgId, groupKey | Circuit close events |
| `circuit.status` | Gauge | orgId, groupKey | Current circuit status (0=closed, 1=open) |
| `circuit.open_time` | Timer | orgId, groupKey | Time spent in open state |
| `circuit.failure_count` | Gauge | orgId, groupKey | Current failure count |
| `circuit.threshold` | Gauge | orgId, groupKey | Current failure threshold |
| `circuit.success_after_open` | Counter | orgId, groupKey | Successful requests after circuit reopened |
| `circuit.failure_after_open` | Counter | orgId, groupKey | Failed requests after circuit reopened |

### 4.4 Queue & Backpressure Metrics

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `queue.depth` | Gauge | orgId, groupKey | Current queue depth |
| `queue.pending` | Gauge | orgId, groupKey | Pending requests count |
| `queue.delayed` | Gauge | orgId, groupKey | Delayed requests count |
| `queue.waiting_retry` | Gauge | orgId, groupKey | Requests waiting for retry |
| `queue.growth_rate` | Gauge | orgId, groupKey | Queue growth rate (req/sec) |
| `queue.avg_wait_time` | Gauge | orgId, groupKey | Average wait time in queue |
| `system.load` | Gauge | - | System load factor |
| `system.memory` | Gauge | - | Memory utilization (%) |
| `system.cpu` | Gauge | - | CPU utilization (%) |
| `system.rejection_rate` | Gauge | reason | Rate of rejected requests (req/sec) |
| `system.network_errors` | Counter | errorType | Network error occurrences |

### 4.5 Retry & Error Metrics

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `retry.attempts` | Counter | orgId, groupKey, attemptNumber | Retry attempts by number |
| `retry.max_reached` | Counter | orgId, groupKey | Max retry attempts reached |
| `retry.success` | Counter | orgId, groupKey, originalStatus, attemptCount | Successful retries |
| `retry.failure` | Counter | orgId, groupKey, finalStatus, attemptCount | Failed retries |
| `retry.by_status_category` | Counter | category, attemptNumber | Retries by status category |
| `retry.after_delay` | Counter | orgId, groupKey, delayReason | Retries after deliberate delay |
| `error.count` | Counter | orgId, groupKey, statusCode, category | Errors by status |
| `error.rate` | Gauge | orgId, groupKey | Error rate (%) |
| `error.first_failure` | Counter | orgId, groupKey, statusCode | First failure by status |
| `error.consecutive_failures` | Histogram | orgId, groupKey | Distribution of consecutive failures |

### 4.6 Downstream Service Metrics

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `downstream.response_time` | Timer | hostname, endpoint | Service response time |
| `downstream.error_rate` | Gauge | hostname, endpoint | Service error rate (%) |
| `downstream.status` | Counter | hostname, statusCode | Status code distribution |
| `downstream.retry_rate` | Gauge | hostname | Retry rate per service (%) |
| `downstream.throughput` | Gauge | hostname, endpoint | Requests per second |
| `downstream.retry_effectiveness` | Gauge | hostname, statusCategory | Retry success rate (%) |
| `downstream.avg_payload_size` | Histogram | hostname, endpoint | Average payload size |
| `downstream.timeout_rate` | Gauge | hostname, endpoint | Timeout rate (%) |

### 4.7 System Health Metrics

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `system.active_requests` | Gauge | - | Current active requests |
| `system.active_groups` | Gauge | - | Active request groups |
| `system.cooldown_groups` | Gauge | - | Groups in cooldown |
| `system.success_rate` | Gauge | - | Overall success rate (%) |
| `system.throughput` | Gauge | - | Requests per second |
| `system.capacity` | Gauge | - | Current capacity setting |
| `system.uptime` | Gauge | - | System uptime in seconds |
| `system.event_loop_lag` | Gauge | - | Event loop lag in ms |
| `system.memory_leak_indicators` | Gauge | - | Memory growth indicators |
| `system.restart_count` | Counter | reason | System restart count |

### 4.8 Group Metrics (Enhanced Legacy Support)

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `group.success_rate` | Gauge | groupKey, orgId | Success rate by group (%) |
| `group.error_types` | Counter | groupKey, statusCategory | Error distribution by group |
| `group.retry_effectiveness` | Gauge | groupKey | Retry success rate by group (%) |
| `group.throughput` | Gauge | groupKey | Requests per second by group |
| `group.cooldown_frequency` | Gauge | groupKey, timeWindow | Cooldown frequency |
| `group.cooldown_reasons` | Counter | groupKey, reason | Cooldown reason distribution |
| `group.avg_response_time` | Gauge | groupKey | Average response time trend |
| `group.request_volume_trend` | Gauge | groupKey | Request volume trend |

### 4.9 Dead Letter Metrics (Future)

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| `deadletter.added` | Counter | orgId, groupKey, reason | Items added to dead letter |
| `deadletter.count` | Gauge | orgId, groupKey | Current dead letter count |
| `deadletter.age` | Histogram | orgId, groupKey | Age distribution of dead letters |
| `deadletter.replayed` | Counter | orgId, groupKey | Replayed dead letter count |
| `deadletter.replay_success` | Counter | orgId, groupKey | Successful dead letter replays |
| `deadletter.permanent_failures` | Counter | orgId, groupKey, reason | Permanently failed requests |

## 5. Enhanced API Endpoints

### 5.1 Legacy-Compatible Endpoints

These endpoints maintain backward compatibility with the legacy dashboard:

#### 5.1.1 `/metrics/summary`

**Purpose**: Overall system status and health (same format as legacy)

**Response Example**:
```json
{
  "timestamp": "2023-06-01T12:00:00Z",
  "counters": {
    "totalRequests": 1250345,
    "successfulRequests": 1210822,
    "failedRequests": 39523,
    "retryAttempts": 42891,
    "rateLimitHits": 7235,
    "cooldownActivations": 312
  },
  "current": {
    "activeRequests": 4728,
    "activeRequestGroups": 87,
    "cooldownGroups": 5,
    "systemLoad": 0.72,
    "capacityUtilization": 0.65
  },
  "successRate": "96.84%",
  "cooldownGroups": [
    {
      "key": "org123:api:example.com",
      "remainingTime": 35000,
      "reason": "FAILURE_THRESHOLD_EXCEEDED",
      "failureCount": 28
    }
  ]
}
```

#### 5.1.2 `/metrics/groups`

**Purpose**: Per-group performance analytics (enhanced from legacy)

**Response Example**:
```json
{
  "timestamp": "2023-06-01T12:00:00Z",
  "groups": [
    {
      "key": "org123:api:example.com",
      "current": {
        "success": 192,
        "failure": 28,
        "inCooldown": true,
        "cooldownRemaining": 35000,
        "activeRequests": 42
      },
      "aggregate": {
        "total": 15234,
        "success": 14892,
        "failure": 342,
        "retries": 421,
        "cooldowns": 3,
        "maxRetryReached": 18
      },
      "successRate": "97.75%",
      "avgResponseTime": "342ms",
      "queueDepth": {
        "accepted": 12,
        "delayed": 8,
        "waitingRetry": 22
      },
      "throttling": {
        "totalThrottled": 187,
        "reasonDistribution": {
          "GROUP_COOLDOWN": 42,
          "GROUP_LIMIT_EXCEEDED": 98,
          "GLOBAL_CAPACITY_EXCEEDED": 47
        }
      }
    }
  ]
}
```

#### 5.1.3 `/metrics/historical?timeframe=1h&metric=activeRequests`

**Purpose**: Time-series data for charts (same format as legacy)

**Response Example**:
```json
{
  "timeframe": "1h",
  "metric": "activeRequests",
  "resolution": "1m",
  "points": [
    {"timestamp": "2023-06-01T11:01:00Z", "value": 4372},
    {"timestamp": "2023-06-01T11:02:00Z", "value": 4531},
    {"timestamp": "2023-06-01T12:00:00Z", "value": 4728}
  ]
}
```

#### 5.1.4 `/metrics/status`

**Purpose**: Error and status code distribution (enhanced from legacy)

**Response Example**:
```json
{
  "timestamp": "2023-06-01T12:00:00Z",
  "byCode": {
    "200": 987342,
    "201": 2341,
    "400": 5423,
    "401": 123,
    "429": 7235,
    "500": 15234,
    "502": 5623,
    "503": 2341
  },
  "byCategory": {
    "http_success": 990250,
    "http_auth_failure": 575,
    "http_rate_limit": 7235,
    "http_client_error": 6875,
    "http_server_error": 15234,
    "http_gateway_error": 6858,
    "http_service_unavailable": 2341
  },
  "retryEffectiveness": {
    "byCategory": {
      "http_rate_limit": "87.2%",
      "http_server_error": "65.3%",
      "http_gateway_error": "82.1%",
      "http_service_unavailable": "91.4%"
    }
  }
}
```

### 5.2 Next Implementation Advanced Endpoints

New endpoints that leverage the enhanced capabilities of the next implementation:

#### 5.2.1 `/metrics/dimensional`

**Purpose**: Flexible querying of dimensional metrics

**Request Example**:
```json
{
  "metrics": ["response.time", "retry.attempts"],
  "dimensions": {
    "groupKey": "org123:api:example.com",
    "statusCode": "429"
  },
  "timeRange": {
    "start": "2023-06-01T11:00:00Z",
    "end": "2023-06-01T12:00:00Z"
  },
  "aggregation": "avg"
}
```

**Response Example**:
```json
{
  "results": [
    {
      "metric": "response.time",
      "dimensions": {
        "groupKey": "org123:api:example.com",
        "statusCode": "429"
      },
      "value": 245.6,
      "sampleCount": 127
    },
    {
      "metric": "retry.attempts",
      "dimensions": {
        "groupKey": "org123:api:example.com",
        "statusCode": "429"
      },
      "value": 3.2,
      "sampleCount": 127
    }
  ]
}
```

#### 5.2.2 `/metrics/cooldown/insights`

**Purpose**: Detailed cooldown analytics

**Response Example**:
```json
{
  "timestamp": "2023-06-01T12:00:00Z",
  "currentCooldowns": [
    {
      "groupKey": "org123:api:example.com",
      "orgId": "org123",
      "startTime": "2023-06-01T11:55:23Z",
      "endTime": "2023-06-01T12:10:23Z",
      "remainingMs": 623000,
      "reason": "FAILURE_THRESHOLD_EXCEEDED",
      "failureCount": 28,
      "recentErrors": [
        {"statusCode": 502, "count": 18},
        {"statusCode": 503, "count": 10}
      ]
    }
  ],
  "historicalInsights": {
    "mostFrequentGroups": [
      {"groupKey": "org456:chat:api.example.org", "cooldownCount": 23},
      {"groupKey": "org123:api:example.com", "cooldownCount": 14}
    ],
    "primaryReasons": {
        "FAILURE_THRESHOLD_EXCEEDED": 68,
        "RATE_LIMIT_EXCEEDED": 42,
        "MANUAL_ACTIVATION": 3
    },
    "timeDistribution": {
      "byHour": [
        {"hour": 0, "count": 3},
        {"hour": 1, "count": 2},
        {"hour": 12, "count": 15},
        {"hour": 13, "count": 23}
      ],
      "peakPeriod": "12-14"
    },
    "durationStats": {
      "avgDuration": 780000,
      "minDuration": 60000,
      "maxDuration": 3600000,
      "p95Duration": 1800000
    }
    },
  "recommendations": [
    {
      "groupKey": "org456:chat:api.example.org",
      "issue": "Frequent cooldowns due to rate limiting",
      "suggestion": "Increase rate limit threshold or implement client-side throttling"
    },
    {
      "groupKey": "org123:api:example.com",
      "issue": "Recurring gateway errors during peak hours",
      "suggestion": "Investigate downstream service capacity during 12-14 hour period"
    }
  ]
}
```

#### 5.2.3 `/metrics/retry/analysis`

**Purpose**: Detailed retry effectiveness analytics

**Response Example**:
```json 
{
  "timestamp": "2023-06-01T12:00:00Z",
  "overallStats": {
    "totalRetries": 42891,
    "successfulRetries": 32145,
    "failedRetries": 10746,
    "successRate": "74.9%",
    "avgAttemptsNeeded": 2.3,
    "retryDistribution": {
      "attempt1": 24567,
      "attempt2": 12453,
      "attempt3": 4532,
      "attempt4": 1234,
      "attempt5": 105
    }
  },
  "byStatusCategory": [
    {
      "category": "http_rate_limit",
      "count": 7235,
      "successRate": "87.2%",
      "avgAttemptsNeeded": 1.8
    },
    {
      "category": "http_server_error",
      "count": 15234,
      "successRate": "65.3%",
      "avgAttemptsNeeded": 2.7
    },
    {
      "category": "http_gateway_error",
      "count": 6858,
      "successRate": "82.1%",
      "avgAttemptsNeeded": 2.2
    },
    {
      "category": "http_service_unavailable",
      "count": 2341,
      "successRate": "91.4%",
      "avgAttemptsNeeded": 1.6
    }
  ],
  "byGroup": [
    {
      "groupKey": "org123:api:example.com",
      "retryCount": 1245,
      "successRate": "78.3%",
      "avgAttemptsNeeded": 2.1,
      "mostCommonError": {
        "statusCode": 502,
        "count": 723
      }
    },
    {
      "groupKey": "org456:chat:api.example.org",
      "retryCount": 3456,
      "successRate": "65.2%",
      "avgAttemptsNeeded": 2.8,
      "mostCommonError": {
        "statusCode": 500,
        "count": 1243
      }
    }
  ],
  "insights": [
    {
      "category": "http_gateway_error",
      "insight": "Retry success rate drops significantly after 2 attempts",
      "recommendation": "Consider reducing max attempts for gateway errors to 2"
    },
    {
      "category": "http_server_error",
      "insight": "High variance in retry success across different groups",
      "recommendation": "Consider group-specific retry strategies for server errors"
    },
    {
      "category": "http_rate_limit",
      "insight": "First retry after rate limit has 87% success rate",
      "recommendation": "Current exponential backoff strategy is effective"
    }
  ]
}
```

#### 5.2.4 `/metrics/group/health?groupKey=org123:api:example.com`

**Purpose**: Comprehensive group health analysis

**Response Example**:
```json
{
  "timestamp": "2023-06-01T12:00:00Z",
  "groupKey": "org123:api:example.com",
  "healthScore": 85,
  "status": "HEALTHY",
  "requestVolume": {
    "last24h": 124532,
    "trend": "+12% vs. previous 24h"
  },
  "performance": {
    "avgResponseTime": "342ms",
    "p95ResponseTime": "876ms",
    "trend": "-5% vs. previous 24h"
  },
  "reliability": {
    "successRate": "97.3%",
    "errorRate": "2.7%",
    "retryEffectiveness": "78.3%",
    "cooldownFrequency": "0.2 per hour"
  },
  "statusDistribution": {
    "2xx": 121345,
    "4xx": 1234,
    "5xx": 1953
  },
  "queueMetrics": {
    "avgQueueDepth": 12,
    "avgQueueTime": "120ms",
    "waitingRequests": 22
  },
  "pastIssues": [
    {
      "timestamp": "2023-06-01T08:45:00Z",
      "duration": "15m",
      "type": "COOLDOWN",
      "reason": "FAILURE_THRESHOLD_EXCEEDED",
      "statusCodes": [502, 503]
    }
  ],
  "anomalies": [
    {
      "metric": "responseTime",
      "severity": "MEDIUM",
      "current": "342ms",
      "baseline": "280ms",
      "deviation": "+22%"
    }
  ],
  "recommendations": [
    {
      "priority": "MEDIUM",
      "issue": "Response time degradation",
      "action": "Investigate increased latency with target service"
    }
  ]
}
```

#### 5.2.5 `/metrics/downstream/map`

**Purpose**: Visual mapping of downstream service health

**Response Example**:
```json
{
  "timestamp": "2023-06-01T12:00:00Z",
  "services": [
    {
      "hostname": "api.example.com",
      "endpoints": 8,
      "health": 92,
      "requestVolume": 132456,
      "avgResponseTime": 456,
      "errorRate": "5.7%",
      "status": "HEALTHY"
    },
    {
      "hostname": "auth.example.org",
      "endpoints": 3,
      "health": 68,
      "requestVolume": 23456,
      "avgResponseTime": 723,
      "errorRate": "12.3%",
      "status": "DEGRADED"
    },
    {
      "hostname": "media.example.net",
      "endpoints": 5,
      "health": 42,
      "requestVolume": 18543,
      "avgResponseTime": 1345,
      "errorRate": "23.5%",
      "status": "CRITICAL"
    }
  ],
  "connections": [
    {
      "source": "org123",
      "target": "api.example.com",
      "requestVolume": 45678,
      "health": 90
    },
    {
      "source": "org456",
      "target": "api.example.com",
      "requestVolume": 78945,
      "health": 94
    },
    {
      "source": "org123",
      "target": "auth.example.org",
      "requestVolume": 12345,
      "health": 72
    },
    {
      "source": "org789",
      "target": "media.example.net",
      "requestVolume": 18543,
      "health": 42
    }
  ],
  "hotspots": [
    {
      "hostname": "auth.example.org",
      "endpoint": "/v1/validate",
      "requestVolume": 12345,
      "errorRate": "18.7%",
      "responseTime": 912,
      "impact": "HIGH"
    },
    {
      "hostname": "media.example.net",
      "endpoint": "/v2/upload",
      "requestVolume": 8432,
      "errorRate": "32.4%",
      "responseTime": 2145,
      "impact": "CRITICAL"
    }
  ],
  "recentChanges": [
    {
      "hostname": "media.example.net",
      "metric": "errorRate",
      "previous": "8.2%",
      "current": "23.5%",
      "changeTime": "2023-06-01T10:15:00Z",
      "severity": "CRITICAL"
    }
  ]
}
```

#### 5.2.6 `/metrics/alerts/config`

**Purpose**: Manage alert configurations

**Request Example (POST)**:
```json
{
  "name": "High Error Rate Alert",
  "metricName": "error.rate",
  "dimensions": {
    "groupKey": "org123:api:example.com"
  },
  "conditions": [
    {
      "operator": "gt",
      "threshold": 10,
      "duration": 300000
    }
  ],
  "actions": [
    {
      "type": "webhook",
      "target": "https://hooks.example.com/alert",
      "payload": {
        "channel": "alerts",
        "team": "backend"
      }
    },
    {
      "type": "email",
      "target": "devops@example.com"
    }
  ],
  "enabled": true,
  "cooldown": 3600000
}
```

**Response Example (GET)**:
```json
{
  "alerts": [
    {
      "id": "alert123",
      "name": "High Error Rate Alert",
      "metricName": "error.rate",
      "dimensions": {
        "groupKey": "org123:api:example.com"
      },
      "conditions": [
        {
          "operator": "gt",
          "threshold": 10,
          "duration": 300000
        }
      ],
      "actions": [
        {
          "type": "webhook",
          "target": "https://hooks.example.com/alert"
        },
        {
          "type": "email",
          "target": "devops@example.com"
        }
      ],
      "enabled": true,
      "cooldown": 3600000,
      "lastTriggered": "2023-06-01T09:23:45Z",
      "status": "ok"
    }
  ]
}
```


## 6. Data Storage Model

### 6.1 In-Memory Data Structures

#### 6.1.1 Circular Buffer (Enhanced Legacy Implementation)

```typescript
class CircularBuffer<T> {
  private buffer: T[];
  private currentIndex: number = 0;
  private isFull: boolean = false;
  private lastTimestamp: number = 0;
  
  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }
  
  add(item: T): void {
    // Update last timestamp if item has timestamp property
    if ((item as any).timestamp) {
      this.lastTimestamp = Math.max(this.lastTimestamp, (item as any).timestamp);
    }
    
    this.buffer[this.currentIndex] = item;
    this.currentIndex = (this.currentIndex + 1) % this.capacity;
    if (!this.isFull && this.currentIndex === 0) this.isFull = true;
  }
  
  getAll(): T[] {
    if (!this.isFull) {
      return this.buffer.slice(0, this.currentIndex);
    }
    return [
      ...this.buffer.slice(this.currentIndex),
      ...this.buffer.slice(0, this.currentIndex)
    ];
  }
  
  getRecentPoints(minutes: number): T[] {
    // Return points from the last N minutes
    const cutoffTime = Date.now() - (minutes * 60 * 1000);
    return this.getAll().filter(point => 
      (point as any).timestamp >= cutoffTime
    );
  }
  
  // Support for various resampling methods
  resample(intervalMs: number): T[] {
    const allPoints = this.getAll();
    if (allPoints.length <= 1) return allPoints;
    
    // Sort by timestamp if available
    if ((allPoints[0] as any).timestamp) {
      allPoints.sort((a, b) => (a as any).timestamp - (b as any).timestamp);
    }
    
    // Find time range
    const startTime = (allPoints[0] as any).timestamp;
    const endTime = (allPoints[allPoints.length - 1] as any).timestamp;
    
    // Create resampled points
    const result: T[] = [];
    for (let t = startTime; t <= endTime; t += intervalMs) {
      // Find points in this interval
      const intervalPoints = allPoints.filter(
        p => (p as any).timestamp >= t && (p as any).timestamp < t + intervalMs
      );
      
      if (intervalPoints.length > 0) {
        // Compute average for this interval
        const sum = intervalPoints.reduce((acc, p) => acc + (p as any).value, 0);
        const avg = sum / intervalPoints.length;
        
        // Create resampled point (actual implementation would use proper generics)
        const resampledPoint = {
          timestamp: t,
          value: avg
        } as unknown as T;
        
        result.push(resampledPoint);
      }
    }
    
    return result;
  }
  
  // Get buffer utilization stats
  getStats(): { capacity: number; used: number; utilization: number } {
    const used = this.isFull ? this.capacity : this.currentIndex;
    return {
      capacity: this.capacity,
      used,
      utilization: used / this.capacity
    };
  }
  
  // Clear all data
  clear(): void {
    this.buffer = new Array(this.capacity);
    this.currentIndex = 0;
    this.isFull = false;
    this.lastTimestamp = 0;
  }
}
```

#### 6.1.2 Dimensional Counter

```typescript
class DimensionalCounter {
  private counters: Map<string, number> = new Map();
  private timestamps: Map<string, number> = new Map();
  
  increment(dimensions: Record<string, string>, value: number = 1): void {
    const key = this.dimensionsToKey(dimensions);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
    this.timestamps.set(key, Date.now());
  }
  
  get(dimensions: Record<string, string>): number {
    const key = this.dimensionsToKey(dimensions);
    return this.counters.get(key) || 0;
  }
  
  getAll(): Array<{ dimensions: Record<string, string>, value: number, timestamp: number }> {
    return Array.from(this.counters.entries()).map(([key, value]) => ({
      dimensions: this.keyToDimensions(key),
      value,
      timestamp: this.timestamps.get(key) || Date.now()
    }));
  }
  
  // Filter by dimension value
  getByDimension(dimensionKey: string, dimensionValue: string): Array<{ dimensions: Record<string, string>, value: number, timestamp: number }> {
    return this.getAll()
      .filter(item => item.dimensions[dimensionKey] === dimensionValue);
  }
  
  // Get top N entries by value
  getTopN(n: number): Array<{ dimensions: Record<string, string>, value: number, timestamp: number }> {
    return this.getAll()
      .sort((a, b) => b.value - a.value)
      .slice(0, n);
  }
  
  // Reset a counter for rate calculations
  reset(dimensions: Record<string, string>): void {
    const key = this.dimensionsToKey(dimensions);
    this.counters.set(key, 0);
    this.timestamps.set(key, Date.now());
  }
  
  // Reset all counters
  resetAll(): void {
    for (const key of this.counters.keys()) {
      this.counters.set(key, 0);
      this.timestamps.set(key, Date.now());
    }
  }
  
  private dimensionsToKey(dimensions: Record<string, string>): string {
    return Object.entries(dimensions)
      .sort(([k1], [k2]) => k1.localeCompare(k2))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
  }
  
  private keyToDimensions(key: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (key === '') return result;
    
    key.split(',').forEach(pair => {
      const [k, v] = pair.split(':');
      result[k] = v;
    });
    
    return result;
  }
}
```

#### 6.1.3 Time Window Counter

```typescript
class TimeWindowCounter {
  private windows: Map<number, number> = new Map();
  private windowSizeMs: number;
  
  constructor(windowSizeMs: number = 60000) { // Default 1-minute windows
    this.windowSizeMs = windowSizeMs;
  }
  
  increment(timestamp: number = Date.now(), value: number = 1): void {
    const windowKey = Math.floor(timestamp / this.windowSizeMs);
    const current = this.windows.get(windowKey) || 0;
    this.windows.set(windowKey, current + value);
  }
  
  // Get rate over the last N windows
  getRate(numWindows: number = 1): number {
    const now = Date.now();
    const currentWindow = Math.floor(now / this.windowSizeMs);
    
    let total = 0;
    for (let i = 0; i < numWindows; i++) {
      total += this.windows.get(currentWindow - i) || 0;
    }
    
    return total / numWindows;
  }
  
  // Get all window data for time series
  getWindows(startTime: number, endTime: number): Array<{timestamp: number, value: number}> {
    const startWindow = Math.floor(startTime / this.windowSizeMs);
    const endWindow = Math.floor(endTime / this.windowSizeMs);
    
    const result: Array<{timestamp: number, value: number}> = [];
    
    for (let windowKey = startWindow; windowKey <= endWindow; windowKey++) {
      result.push({
        timestamp: windowKey * this.windowSizeMs,
        value: this.windows.get(windowKey) || 0
      });
    }
    
    return result;
  }
  
  // Get current rate (events per second)
  getCurrentRate(): number {
    const now = Date.now();
    const currentWindow = Math.floor(now / this.windowSizeMs);
    const currentWindowValue = this.windows.get(currentWindow) || 0;
    
    // Calculate how much of the current window has elapsed
    const windowProgress = (now % this.windowSizeMs) / this.windowSizeMs;
    
    // If window just started, blend with previous window
    if (windowProgress < 0.1) {
      const prevWindowValue = this.windows.get(currentWindow - 1) || 0;
      return (currentWindowValue / windowProgress + prevWindowValue) / (this.windowSizeMs / 1000);
    }
    
    // Otherwise estimate from current window
    return currentWindowValue / windowProgress / (this.windowSizeMs / 1000);
  }
  
  // Clean up old windows to prevent memory leaks
  cleanupOldWindows(maxAgeMs: number): void {
    const now = Date.now();
    const cutoffWindow = Math.floor((now - maxAgeMs) / this.windowSizeMs);
    
    for (const [windowKey] of this.windows.entries()) {
      if (windowKey < cutoffWindow) {
        this.windows.delete(windowKey);
      }
    }
  }
}
```

#### 6.1.4 Dimensional Gauge

```typescript
class DimensionalGauge {
  private gauges: Map<string, number> = new Map();
  private timestamps: Map<string, number> = new Map();
  
  record(dimensions: Record<string, string>, value: number): void {
    const key = this.dimensionsToKey(dimensions);
    this.gauges.set(key, value);
    this.timestamps.set(key, Date.now());
  }
  
  increment(dimensions: Record<string, string>, value: number = 1): void {
    const key = this.dimensionsToKey(dimensions);
    const current = this.gauges.get(key) || 0;
    this.gauges.set(key, current + value);
    this.timestamps.set(key, Date.now());
  }
  
  decrement(dimensions: Record<string, string>, value: number = 1): void {
    this.increment(dimensions, -value);
  }
  
  get(dimensions: Record<string, string>): number {
    const key = this.dimensionsToKey(dimensions);
    return this.gauges.get(key) || 0;
  }
  
  getAll(): Array<{ dimensions: Record<string, string>, value: number, timestamp: number }> {
    return Array.from(this.gauges.entries()).map(([key, value]) => ({
      dimensions: this.keyToDimensions(key),
      value,
      timestamp: this.timestamps.get(key) || Date.now()
    }));
  }
  
  // Additional helper methods similar to DimensionalCounter
  private dimensionsToKey(dimensions: Record<string, string>): string {
    return Object.entries(dimensions)
      .sort(([k1], [k2]) => k1.localeCompare(k2))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
  }
  
  private keyToDimensions(key: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (key === '') return result;
    
    key.split(',').forEach(pair => {
      const [k, v] = pair.split(':');
      result[k] = v;
    });
    
    return result;
  }
}
```

### 6.2 MongoDB Schema

#### 6.2.1 Raw Metrics Document

```typescript
interface MetricDocument {
  _id: ObjectId;
  name: string;            // Metric name
  type: string;            // counter, gauge, timing, etc.
  value: number;           // Numeric value
  dimensions: {            // Dimensions for filtering/grouping
    groupKey?: string;
    orgId?: string;
    statusCode?: string;
    hostname?: string;
    endpoint?: string;
    [key: string]: string; // Other dimensions
  };
  timestamp: Date;         // When the metric was recorded
}
```

#### 6.2.2 Aggregated Metrics Document

```typescript
interface AggregatedMetricDocument {
  _id: ObjectId;
  name: string;            // Metric name
  period: {
    start: Date;           // Start of aggregation period
    end: Date;             // End of aggregation period
    duration: string;      // 1m, 5m, 1h, 1d, etc.
  };
  dimensions: {            // Dimensions for filtering/grouping
    groupKey?: string;
    orgId?: string;
    // Other dimensions
  };
  values: {                // Statistical aggregations
    count: number;
    sum: number;
    min: number;
    max: number;
    avg: number;
    p50?: number;          // Optional percentiles
    p90?: number;
    p95?: number;
    p99?: number;
  };
  // For rate metrics
  rates?: {
    perSecond: number;
    perMinute: number;
    perHour: number;
  };
}
```

#### 6.2.3 Alert Configuration Document

```typescript
interface AlertConfigDocument {
  _id: ObjectId;
  name: string;            // Alert name
  metricName: string;      // Metric to monitor
  dimensions: {            // Dimensions to filter on
    groupKey?: string;
    orgId?: string;
    // Other dimensions
  };
  conditions: {
    operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
    threshold: number;
    duration: number;      // Duration in ms the condition must be true
  }[];
  actions: {
    type: 'webhook' | 'email' | 'slack';
    target: string;        // URL or address
    payload?: Record<string, any>;
  }[];
  enabled: boolean;
  cooldown: number;        // Minimum time between alerts in ms
  lastTriggered?: Date;    // When the alert was last triggered
  status: 'ok' | 'alerting' | 'recovery';
}
```

#### 6.2.4 Health Status Document

```typescript
interface HealthStatusDocument {
  _id: ObjectId;
  entityType: 'group' | 'service' | 'system';
  entityId: string;        // groupKey, hostname, etc.
  timestamp: Date;
  metrics: Record<string, {
    value: number;
    score: number;
    trend: 'improving' | 'degrading' | 'stable';
  }>;
  overallScore: number;
  status: 'healthy' | 'degraded' | 'critical';
  anomalies: {
    metricName: string;
    value: number;
    threshold: number;
    timestamp: Date;
  }[];
}
```

#### 6.2.5 Pattern Detection Document

```typescript
interface PatternDocument {
  _id: ObjectId;
  entityType: 'group' | 'service' | 'system';
  entityId: string;
  metricName: string;
  patternType: 'daily' | 'weekly' | 'monthly';
  lastUpdated: Date;
  confidence: number;      // Confidence score of the pattern (0-1)
  pattern: {
    // For daily pattern
    hourlyDistribution?: number[];  // 24 values, one per hour
    // For weekly pattern
    dailyDistribution?: number[];   // 7 values, one per day
    // For monthly pattern
    dayOfMonthDistribution?: number[]; // 31 values
  };
  peaks: number[];         // Indices of peak periods
  troughs: number[];       // Indices of low periods
}
```

## 7. Implementation Strategy

### 7.1 Phased Rollout Plan

#### Phase 1: Core Metrics Foundation (Weeks 1-3)
- Implement `MemoryMetricsStore` with legacy compatibility
- Create MongoDB schema and basic repository with batch operations
- Implement `MetricsEventListener` for event-based collection
- Ensure compatibility with existing dashboard endpoints
- Unit tests and integration tests
- **Success Criteria**: Dashboard shows same data quality as legacy system

#### Phase 2: Hybrid Storage Implementation (Weeks 4-6)
- Implement MongoDB persistence layer with TTL indexes
- Create hybrid query service for seamless data access
- Add periodic job for cleaning old memory data
- Implement dimensional metrics support
- Develop automatic aggregation pipeline
- Performance testing for write throughput
- **Success Criteria**: Historical data beyond 24h available via API

#### Phase 3: Enhanced Metrics Collection (Weeks 7-10)
- Add all new metrics defined in the metrics catalog
- Implement periodic state collection
- Create advanced API endpoints for new metrics
- Enhance system-level metrics collection
- Add queue depth and backpressure metrics
- Implement downstream service health tracking
- End-to-end tests
- **Success Criteria**: All defined metrics available through API

#### Phase 4: Analytics and Intelligence (Weeks 11-16)
- Implement anomaly detection algorithms
- Develop pattern recognition for cyclical trends
- Create group health scoring system
- Add predictive capacity analysis
- Implement cooldown analytics
- Develop alerting framework
- Create dashboard enhancements
- Performance and load testing
- **Success Criteria**: Actionable insights available via API

### 7.2 Technical Considerations

#### 7.2.1 MongoDB Configuration
- **Data Management**:
  - **Write Concern**: Use `w:1` for metrics writing to balance durability and performance
  - **Batch Size**: Use batch size of 500-1000 documents for optimal write performance

- **Storage Optimization**:
  - **Indexes**: Create compound indexes on frequently queried dimensions and timestamp
  - **TTL Indexes**: Set up cascading TTL indexes for different retention periods
    - Raw metrics: 7 days
    - 5-minute aggregations: 30 days
    - Hourly aggregations: 90 days
    - Daily aggregations: 2 years