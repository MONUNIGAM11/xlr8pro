import { URL } from 'url';

export enum RequestStatus {
  ACCEPTED = 'accepted',
  FORWARDING = 'forwarding',
  DELAYED = 'delayed',
  WAITING_RETRY = 'waiting_retry',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DEADLETTERED = 'deadlettered'
}

export interface RequestData {
  id: string;
  orgId?: string;
  groupBy: string;
  groupKey?: string;
  targetUrl: URL | string;
  method?: string;
  headers?: Record<string, string>;
  body?: Buffer;
  status?: RequestStatus;
  payload?: any;
  createdAt?: Date;
  lastUpdatedAt?: Date;
  completedAt?: Date;
  attempts?: number;
  nextRetryAt?: Date;
  responseStatus?: number;
  responseTime?: number;
  lastError?: string;
  canRetry?: (maxAttempts: number) => boolean;
  markCompleted?: (status: number, responseTime: number) => void;
  markFailed?: (error: Error, status: number) => void;
  delayMs?: number;
}

export class Request {
  id: string;
  orgId: string;
  groupBy: string;
  targetUrl: URL | string | undefined;
  method: string;
  headers: Record<string, string>;
  body: Buffer;
  status: RequestStatus;
  createdAt: Date;
  lastUpdatedAt: Date;
  completedAt: Date | undefined;
  attempts: number;
  nextRetryAt: Date | undefined;
  responseStatus: number | null;
  responseTime: number | null;
  lastError: string | null;
  groupKey: string;
  delayMs: number | undefined;

  /**
   * Create a new Request
   * @param {RequestData} data - Request data
   */
  constructor(data: RequestData) {
    this.id = data.id || `req-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    this.orgId = data.orgId;
    this.groupBy = data.groupBy;
    this.targetUrl = typeof data.targetUrl === 'string' ? new URL(data.targetUrl) : data.targetUrl;
    this.method = data.method || 'GET';
    this.headers = data.headers || {};
    this.body = data.body || Buffer.from('');
    this.status = data.status || RequestStatus.ACCEPTED;
    this.createdAt = data.createdAt || new Date();
    this.lastUpdatedAt = data.lastUpdatedAt || new Date();
    this.completedAt = data.completedAt || undefined;
    this.attempts = data.attempts || 0;
    this.nextRetryAt = data.nextRetryAt || undefined;
    this.responseStatus = data.responseStatus || null;
    this.responseTime = data.responseTime || null;
    this.lastError = data.lastError || null;
    this.delayMs = data.delayMs || undefined;
    this.groupKey = data.groupKey || this.computeGroupKey();
  }

  /**
   * Compute the group key for this request
   * @returns {string} Group key
   */
  private computeGroupKey(): string {
    let hostname = 'unknown';
    
    if (this.targetUrl instanceof URL) {
      hostname = this.targetUrl.hostname;
    } else if (typeof this.targetUrl === 'string') {
      try {
        hostname = new URL(this.targetUrl).hostname;
      } catch (error) {
        // Invalid URL, use default hostname
      }
    }
    
    return `${this.orgId}:${this.groupBy}:${hostname}`;
  }

  /**
   * Update the status of this request
   * @param {RequestStatus} status - New status
   * @returns {Request} This request for chaining
   */
  updateStatus(status: RequestStatus): Request {
    this.status = status;
    this.lastUpdatedAt = new Date();
    return this;
  }

  /**
   * Mark this request as completed
   * @param {number} responseStatus - HTTP status code
   * @param {number} responseTime - Response time in ms
   * @returns {Request} This request for chaining
   */
  markCompleted(responseStatus: number, responseTime: number): Request {
    this.status = RequestStatus.COMPLETED;
    this.responseStatus = responseStatus;
    this.responseTime = responseTime;
    this.completedAt = new Date();
    this.lastUpdatedAt = new Date();
    return this;
  }

  /**
   * Mark this request as failed
   * @param {Error} error - Error object
   * @param {number} responseStatus - HTTP status code
   * @returns {Request} This request for chaining
   */
  markFailed(error: Error | null, responseStatus?: number): Request {
    this.status = RequestStatus.FAILED;
    this.lastError = error?.message || 'Unknown error';
    this.responseStatus = responseStatus || 0;
    this.completedAt = new Date();
    this.lastUpdatedAt = new Date();
    return this;
  }

  /**
   * Increment the attempt counter
   * @returns {Request} This request for chaining
   */
  incrementAttempt(): Request {
    this.attempts++;
    this.lastUpdatedAt = new Date();
    return this;
  }

  /**
   * Schedule retry for this request
   * @param {Date} nextRetryAt - When to retry
   * @returns {Request} This request for chaining
   */
  scheduleRetry(nextRetryAt: Date): Request {
    this.status = RequestStatus.WAITING_RETRY;
    this.nextRetryAt = nextRetryAt;
    this.lastUpdatedAt = new Date();
    return this;
  }

  /**
   * Schedule delay for this request
   * @param {number} delayMs - Delay in ms
   * @returns {Request} This request for chaining
   */
  scheduleDelay(delayMs: number): Request {
    this.status = RequestStatus.DELAYED;
    this.delayMs = delayMs;
    this.lastUpdatedAt = new Date();
    return this;
  }

  /**
   * Check if this request can be retried
   * @param {number} maxAttempts - Maximum number of attempts
   * @returns {boolean} Whether this request can be retried
   */
  canRetry(maxAttempts: number): boolean {
    return this.attempts < maxAttempts;
  }

  /**
   * Get the time elapsed since creation
   * @returns {number} Time elapsed in ms
   */
  getElapsedTime(): number {
    return Date.now() - this.createdAt.getTime();
  }

  /**
   * Convert to a plain object for serialization
   * @returns {Object} Plain object representation
   */
  toJSON(): Record<string, any> {
    return {
      id: this.id,
      orgId: this.orgId,
      groupBy: this.groupBy,
      targetUrl: this.targetUrl?.toString() || '',
      method: this.method,
      headers: this.headers,
      // Don't include body for serialization
      status: this.status,
      createdAt: this.createdAt.toISOString(),
      lastUpdatedAt: this.lastUpdatedAt.toISOString(),
      completedAt: this.completedAt ? this.completedAt.toISOString() : null,
      attempts: this.attempts,
      nextRetryAt: this.nextRetryAt ? this.nextRetryAt.toISOString() : null,
      responseStatus: this.responseStatus,
      responseTime: this.responseTime,
      lastError: this.lastError,
      groupKey: this.groupKey,
      delayMs: this.delayMs
    };
  }

      /**
   * Compute the group key for this request
   * @returns {string} Group key
   */
  static computeGroupKey(data : Record<string, any>): string {
    let hostname = 'unknown';
    
    if (data.targetUrl instanceof URL) {
      hostname = data.hostname;
    } else if (typeof data.targetUrl === 'string') {
      try {
        hostname = new URL(data.targetUrl).hostname;
      } catch (error) {
        // Invalid URL, use default hostname
      }
    }
    
    return `${data.orgId}:${data.groupBy}:${hostname}`;
  }

  /**
   * Create a Request from a plain object
   * @param {Object} data - Plain object representation
   * @returns {Request} New Request instance
   */
  static fromJSON(data: Record<string, any>): Request {
      // Ensure required properties exist
      if (!data.orgId || !data.groupBy) {
        throw new Error('Required properties orgId and groupBy must be present');
      }
      
      // Convert string dates back to Date objects
      return new Request({
        id: data.id || `req-${Date.now()}-${Math.floor(Math.random() * 10000)}`, // Ensure id is provided
        orgId: data.orgId,
        groupBy: data.groupBy,
        ...data,
        targetUrl: data.targetUrl ? new URL(data.targetUrl) : '',
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        lastUpdatedAt: data.lastUpdatedAt ? new Date(data.lastUpdatedAt) : new Date(),
        completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
        nextRetryAt: data.nextRetryAt ? new Date(data.nextRetryAt) : undefined,
        delayMs: data.delayMs || undefined,
      });
    }
} 