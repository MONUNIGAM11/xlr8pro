export class MetricsService {
  totalRequests = 0;
  inFlight = 0;
  totalLatencyMs = 0;
  completedRequests = 0;

  recordStart() {
    this.totalRequests++;
    this.inFlight++;
    return Date.now();
  }

  recordEnd(startMs: number) {
    this.inFlight--;
    this.completedRequests++;
    this.totalLatencyMs += Date.now() - startMs;
  }

  getMetrics() {
    return {
      totalRequests: this.totalRequests,
      inFlight: this.inFlight,
      completedRequests: this.completedRequests,
      avgLatencyMs: this.completedRequests ? this.totalLatencyMs / this.completedRequests : 0,
    };
  }
}

export const metricsService = new MetricsService();
