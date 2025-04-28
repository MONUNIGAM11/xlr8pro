import { Request } from '../models/Request';

/**
 * Repository for managing Request entities (in-memory)
 */
export class RequestRepository {
  private requests = new Map<string, Request>();
  private requestsByGroup = new Map<string, Set<string>>();

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

  getById(id: string): Request | undefined {
    return this.requests.get(id);
  }

  update(request: Request): Request {
    this.requests.set(request.id, request);
    return request;
  }

  getByGroup(groupKey: string): Request[] {
    const ids = this.requestsByGroup.get(groupKey);
    if (!ids) return [];
    return Array.from(ids).map(id => this.requests.get(id)!).filter(Boolean);
  }
}

// Export singleton instance
export const requestRepository = new RequestRepository();
