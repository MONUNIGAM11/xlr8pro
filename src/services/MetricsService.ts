import { MetricsEventType, Event, eventBus } from '../events/EventBus';

export interface ErrorMetric {
  type: string;
  count: number;
  lastMessage?: string;
}

export class MetricsService {
  totalRequests = 0;
  inFlight = 0;
  totalLatencyMs = 0;
  completedRequests = 0;
  errorCounts: Record<string, ErrorMetric> = {};
  protocolCounts: Record<string, number> = {};
  connectionReuseCount = 0;
  latencyPercentiles: { [key: number]: number } = { 50: 0, 90: 0, 99: 0 };
  requestSizeCounts: Record<string, number> = {};
  userAgentCounts: Record<string, number> = {};
  customMetrics: Record<string, number> = {};
  private latencyValues: number[] = [];

  constructor() {
    // Listen to events for metrics collection
    eventBus.subscribe(MetricsEventType.REQUEST_FORWARDED, () => {
      this.totalRequests++;
      this.inFlight++;
    });
    eventBus.subscribe(MetricsEventType.RESPONSE_RECEIVED, (event: Event) => {
      this.inFlight--;
      this.completedRequests++;
      if (event.payload && event.payload.latencyMs) {
        this.totalLatencyMs += event.payload.latencyMs;
        this.updateLatency(event.payload.latencyMs);
      } else {
        console.warn('Received event with missing latencyMs');
      }
      if (event.payload?.errorType) {
        const errType = event.payload.errorType;
        if (!this.errorCounts[errType]) {
          this.errorCounts[errType] = { type: errType, count: 0 };
        }
        this.errorCounts[errType].count++;
        this.errorCounts[errType].lastMessage = event.payload.errorMessage;
      }
      if (event.payload?.httpVersion) {
        const proto = event.payload.httpVersion;
        this.protocolCounts[proto] = (this.protocolCounts[proto] || 0) + 1;
      }
      if (event.payload?.connectionReused) {
        this.connectionReuseCount++;
      }
      if (event.payload?.requestSize) {
        const size = event.payload.requestSize;
        this.requestSizeCounts[size] = (this.requestSizeCounts[size] || 0) + 1;
      }
      if (event.payload?.userAgent) {
        const userAgent = event.payload.userAgent;
        this.userAgentCounts[userAgent] = (this.userAgentCounts[userAgent] || 0) + 1;
      }
    });
  }

  getMetrics() {
    return {
      totalRequests: this.totalRequests,
      inFlight: this.inFlight,
      completedRequests: this.completedRequests,
      avgLatencyMs: this.completedRequests ? this.totalLatencyMs / this.completedRequests : 0,
      errorCounts: this.errorCounts,
      protocolCounts: this.protocolCounts,
      connectionReuseCount: this.connectionReuseCount,
    };
  }

  resetMetrics() {
    this.totalRequests = 0;
    this.inFlight = 0;
    this.totalLatencyMs = 0;
    this.completedRequests = 0;
    this.errorCounts = {};
    this.protocolCounts = {};
    this.connectionReuseCount = 0;
  }

  addCustomMetric(name: string, value: number) {
    this.customMetrics[name] = (this.customMetrics[name] || 0) + value;
  }

  updateLatency(latencyMs: number) {
    this.latencyValues.push(latencyMs);
    this.latencyValues.sort((a, b) => a - b);
    const totalCount = this.latencyValues.length;
    if (totalCount > 0) {
      this.latencyPercentiles[50] = this.latencyValues[Math.floor(totalCount * 0.50)];
    }
    if (totalCount > 0) {
      this.latencyPercentiles[90] = this.latencyValues[Math.floor(totalCount * 0.90)];
    }
    if (totalCount > 0) {
      this.latencyPercentiles[99] = this.latencyValues[Math.floor(totalCount * 0.99)];
    }
  }
}

export const metricsService = new MetricsService();
