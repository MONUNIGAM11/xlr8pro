import { Request, RequestStatus } from '../models/Request.js';

/**
 * Repository for managing Request entities
 */
export class RequestRepository {
  private requests: Map<string, Request> = new Map();
  private requestsByGroup: Map<string, Set<string>> = new Map();

  constructor() {
    console.log('Request repository initialized');
  }

  /**
   * Add a request to the repository
   * @param {Request} request - Request to add
   * @returns {Request} The added request
   */
  add(request: Request): Request {
    this.requests.set(request.id, request);
    
    if (request.groupKey) {
      if (!this.requestsByGroup.has(request.groupKey)) {
        this.requestsByGroup.set(request.groupKey, new Set());
      }
      this.requestsByGroup.get(request.groupKey)!.add(request.id);
    }
    
    return request;
  }

  /**
   * Get a request by ID
   * @param {string} id - Request ID
   * @returns {Request|undefined} Request or undefined if not found
   */
  getById(id: string): Request | undefined {
    return this.requests.get(id);
  }

  /**
   * Update a request
   * @param {Request} request - Request to update
   * @returns {Request} The updated request
   */
  update(request: Request): Request {
    request.lastUpdatedAt = new Date();
    this.requests.set(request.id, request);
    return request;
  }

  /**
   * Remove a request
   * @param {string} requestId - Request ID
   */
  remove(requestId: string): void {
    const request = this.requests.get(requestId);
    if (request) {
      this.requests.delete(requestId);
      
      if (request.groupKey && this.requestsByGroup.has(request.groupKey)) {
        this.requestsByGroup.get(request.groupKey)!.delete(requestId);
        
        if (this.requestsByGroup.get(request.groupKey)!.size === 0) {
          this.requestsByGroup.delete(request.groupKey);
        }
      }
    }
  }

  /**
   * Get all requests with a specific status
   * @param {RequestStatus} status - Request status
   * @returns {Request[]} Array of requests
   */
  getByStatus(status: RequestStatus): Request[] {
    return Array.from(this.requests.values())
      .filter(request => request.status === status);
  }

  /**
   * Get all requests for a specific group
   * @param {string} groupKey - Group key
   * @returns {Request[]} Array of requests
   */
  getByGroup(groupKey: string): Request[] {
    if (!this.requestsByGroup.has(groupKey)) return [];
    
    return Array.from(this.requestsByGroup.get(groupKey)!)
      .map(requestId => this.requests.get(requestId))
      .filter((request): request is Request => request !== undefined);
  }

  /**
   * Get active request count for a group
   * @param {string} groupKey - Group key
   * @returns {number} Number of active requests
   */
  getActiveRequestCountForGroup(groupKey: string): number {
    if (!this.requestsByGroup.has(groupKey)) return 0;
    
    // Only count requests in active states
    return Array.from(this.requestsByGroup.get(groupKey)!)
      .map(id => this.requests.get(id))
      .filter(req => req && 
        [RequestStatus.ACCEPTED, RequestStatus.FORWARDING, RequestStatus.WAITING_RETRY, RequestStatus.DELAYED].includes(req.status))
      .length;
  }

  /**
   * Get total active request count
   * @returns {number} Total number of active requests
   */
  getTotalActiveRequestCount(): number {
    return this.requests.size;
  }

  /**
   * Serialize repository state
   * @returns {Record<string, any>} Serialized state
   */
  serialize(): Record<string, any> {
    // If checkpoints disabled, return minimal structure
    if (process.env.ENABLE_CHECKPOINTS !== 'true') {
      return { requests: [], requestsByGroup: [] };
    }
    
    // Otherwise, normal serialization
    return {
      requests: Array.from(this.requests.entries())
        .map(([id, request]) => [id, request.toJSON()]),
      requestsByGroup: Array.from(this.requestsByGroup.entries())
        .map(([key, set]) => [key, Array.from(set)])
    };
  }

  /**
   * Deserialize repository state
   * @param {Record<string, any>} data - Serialized state
   */
  deserialize(data: Record<string, any>): void {
    // If checkpoints disabled, do minimal processing
    if (process.env.ENABLE_CHECKPOINTS !== 'true') {
      return;
    }
    
    // Normal deserialization
    this.requests.clear();
    this.requestsByGroup.clear();
    
    if (data.requests) {
      for (const [id, requestData] of data.requests) {
        this.requests.set(id, Request.fromJSON(requestData));
      }
    }
    
    if (data.requestsByGroup) {
      for (const [groupKey, requestIds] of data.requestsByGroup) {
        this.requestsByGroup.set(groupKey, new Set(requestIds));
      }
    }
  }
}

// Export singleton instance
export const requestRepository = new RequestRepository(); 