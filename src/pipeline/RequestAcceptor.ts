import { Request } from '../models/Request';
import { RequestRepository } from '../state/RequestRepository';
import { ThrottleManager } from './ThrottleManager';
import { ProxyExecutor } from './ProxyExecutor';
import { v4 as uuidv4 } from 'uuid';
import { metricsService } from '../services/MetricsService';

export interface RequestAcceptorDependencies {
  requestRepository: RequestRepository;
  throttleManager: ThrottleManager;
  proxyExecutor: ProxyExecutor;
}

export class RequestAcceptor {
  private isShuttingDown = false;

  constructor(private deps: RequestAcceptorDependencies) {}

  async handle(req: any, res: any) {
    if (this.isShuttingDown) {
      res.status(503).json({ status: 'shutting_down' });
      return;
    }
    // Validate and create request
    const { orgId, payload, groupKey } = req.body;
    if (!orgId || !payload) {
      res.status(400).json({ error: 'Missing orgId or payload' });
      return;
    }
    const request: Request = {
      id: uuidv4(),
      orgId,
      groupKey,
      payload,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // Throttle check
    const canAccept = this.deps.throttleManager.canAcceptRequest(request);
    if (!canAccept) {
      res.status(429).json({ error: 'Rate limit exceeded' });
      return;
    }
    this.deps.requestRepository.add(request);
    // Forward to proxy executor (async), record metrics
    const start = metricsService.recordStart();
    this.deps.proxyExecutor.executeRequest(request).finally(() => {
      metricsService.recordEnd(start);
    });
    res.status(202).json({ status: 'accepted', id: request.id });
  }

  shutdown() {
    this.isShuttingDown = true;
  }
}
