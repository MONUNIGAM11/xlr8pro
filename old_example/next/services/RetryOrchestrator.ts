import { Request, RequestStatus } from '../models/Request.js';
import { eventBus, EventType } from '../events/EventBus.js';
import { RetryContext, retryService } from './RetryService.js';
import { StatusClassifier } from './StatusClassifier.js';
import { RequestGroup } from '../models/RequestGroup.js';

/**
 * Dependencies for RetryOrchestrator
 */
export interface RetryOrchestratorDependencies {
  requestRepository: {
    getById(id: string): Request | undefined;
    update(request: Request): Request;
  };
  proxyExecutor: {
    executeRequest(request: Request | string): Promise<any>;
  };
  groupRepository: {
    activateCooldown(groupKey: string, durationMs: number): void;
    recordSuccess(groupKey: string): void;
    recordFailure(groupKey: string): void;
    get(groupKey: string): RequestGroup | null;
  };
  settings: {
    getCooldownDuration(groupKey: string): number;
    getFailureThreshold(groupKey: string): number;
    getMaxAttempts(orgId: string): number;
  };
  deadLetterService?: {
    addToDeadLetter(request: Request): Promise<any>;
  };
}

/**
 * Service for orchestrating retries of failed requests
 */
export class RetryOrchestrator {
  private requestRepository: RetryOrchestratorDependencies['requestRepository'];
  private proxyExecutor: RetryOrchestratorDependencies['proxyExecutor'];
  private groupRepository: RetryOrchestratorDependencies['groupRepository'];
  private settings: RetryOrchestratorDependencies['settings'];
  private deadLetterService?: RetryOrchestratorDependencies['deadLetterService'];
  private retryQueue: Map<string, NodeJS.Timeout> = new Map();
  private isShuttingDown: boolean = false;

  /**
   * Create a new RetryOrchestrator
   * @param dependencies Dependencies
   */
  constructor(dependencies: RetryOrchestratorDependencies) {
    this.requestRepository = dependencies.requestRepository;
    this.proxyExecutor = dependencies.proxyExecutor;
    this.groupRepository = dependencies.groupRepository;
    this.settings = dependencies.settings;
    
    this.deadLetterService = dependencies.deadLetterService;
    
    // Listen for relevant events
    eventBus.subscribe(EventType.RESPONSE_RECEIVED, this.handleResponse.bind(this));
    eventBus.subscribe(EventType.SHUTDOWN_INITIATED, () => {
      this.isShuttingDown = true;
      this.cancelAllRetries();
    });
    
    console.log('Retry orchestrator initialized');
  }

  /**
   * Handle response event
   * @param event Response received event
   */
  private handleResponse(event: any): void {
    const { requestId, payload, groupKey } = event;
    
    if (!requestId || !payload) {
      return;
    }
    
    const request = this.requestRepository.getById(requestId);
    
    if (!request) {
      console.warn(`Received response for unknown request: ${requestId}`);
      return;
    }
    
    // Skip processing if request is already in a terminal state
    if (request.status === RequestStatus.COMPLETED || 
        request.status === RequestStatus.FAILED ||
        request.status === RequestStatus.DEADLETTERED) {
      console.log(`Skipping already ${request.status} request: ${requestId}`);
      return;
    }
    
    const { statusCode, error, headers } = payload;
    
    // Handle rate limiting responses (429)
    if (statusCode === 429) {
      // Calculate cooldown duration from Retry-After header or default
      let cooldownDuration: number;
            
      const retryContext: RetryContext = {
        statusCode,
        attemptCount: request.attempts,
        headers,
        orgId: request.orgId
      };
        
      cooldownDuration = retryService.calculateRetryDelay(retryContext);
      
      // Ensure we have a reasonable duration (fallback to default)
      if (!cooldownDuration || cooldownDuration <= 0) {
        cooldownDuration = this.settings.getCooldownDuration(request.groupKey);
      }
      
      // Activate cooldown for the group
      console.log(`Activating cooldown for group ${request.groupKey} for ${cooldownDuration}ms due to 429 response`);
      this.groupRepository.activateCooldown(request.groupKey, cooldownDuration);
    }
    
    // Create retry context
    const retryContext: RetryContext = {
      statusCode: statusCode || 0,
      attemptCount: request.attempts,
      headers,
      orgId: request.orgId
    };
    
    
    // Check if we should retry
    const shouldPerformRetry = !error || this.shouldRetry(request, retryContext);
    if (statusCode >= 200 && statusCode < 300) {
      // Success
      console.log(` >>>>>> RetryOrchestrator: success for request ${request.id}: ${statusCode}`);
      this.groupRepository.recordSuccess(request.groupKey);
      this.completeRequest(request, true);
    } else if (shouldPerformRetry) {
      // Retry
      console.log(` >>>>>> RetryOrchestrator: shouldRetry for request ${request.id}: ${shouldPerformRetry}`);
      this.scheduleRetry(request, retryContext);
    } else {
      // Failure
      console.log(` >>>>>> RetryOrchestrator: failure for request ${request.id}: ${statusCode}`);
      this.groupRepository.recordFailure(request.groupKey);
      this.completeRequest(request, false);
    }
  }

  /**
   * Check if a request should be retried
   * @param request Request
   * @param context Retry context
   * @returns Whether to retry
   */
  private shouldRetry(request: Request, context: RetryContext): boolean {
    // Don't retry during shutdown
    if (this.isShuttingDown) {
      return false;
    }
    
    // Get max attempts from settings first, fallback to strategy
    const configMaxAttempts = this.settings.getMaxAttempts(request.orgId);
    const strategy = retryService.getStrategy(context);
    const maxAttempts = Math.min(configMaxAttempts, strategy.maxAttempts);
    
    // Enforce maximum attempts limit
    if (request.attempts >= maxAttempts) {
      console.warn(`Max retry attempts (${maxAttempts}) reached for request ${request.id}, will not retry`);
      console.log(`Retry decision for request ${request.id}: 'WILL NOT RETRY' - status: ${context.statusCode}, attempt: ${context.attemptCount}/${maxAttempts}`);
      return false;
    }
    
    // Network errors (ECONNREFUSED) shouldn't retry indefinitely
    if (context.statusCode === 0 && request.attempts >= 3) {
      const error = request.lastError || '';
      if (error.includes('ECONNREFUSED') || error.includes('connect')) {
        console.warn(`Network connectivity error not improving after ${request.attempts} attempts, stopping retries for ${request.id} Retry decision for request ${request.id}: 'WILL NOT RETRY' - status: ${context.statusCode}, attempt: ${context.attemptCount}/${maxAttempts}`);
        return false;
      }
    }

    const shouldRetry = retryService.shouldRetry(context);
    console.log(`Retry decision for request ${request.id}: ${shouldRetry ? 'WILL RETRY' : 'WILL NOT RETRY'} - status: ${context.statusCode}, attempt: ${context.attemptCount}/${maxAttempts}`);
    return shouldRetry;
  }

  /**
   * Schedule a retry for a request
   * @param request Request
   * @param context Retry context
   */
  private scheduleRetry(request: Request, context: RetryContext): void {
    // Increment attempt counter
    request.incrementAttempt();
    
    // Calculate retry delay
    const retryDelay = retryService.calculateRetryDelay(context);
    
    // Set next retry time
    const nextRetryAt = new Date(Date.now() + retryDelay);
    request.scheduleRetry(nextRetryAt);
    
    // Update request in repository
    this.requestRepository.update(request);
    
    // Publish retry scheduled event
    eventBus.publish({
      type: EventType.RETRY_SCHEDULED,
      requestId: request.id,
      groupKey: request.groupKey,
      orgId: request.orgId,
      payload: {
        attempt: request.attempts,
        retryDelay,
        nextRetryAt,
        statusCode: context.statusCode,
        statusCategory: StatusClassifier.classify(context.statusCode)
      },
      timestamp: new Date()
    });
    
    // Clear any existing timeout
    if (this.retryQueue.has(request.id)) {
      console.log(` >>>>>> RetryOrchestrator: clearing existing timeout for request ${request.id}`);
      clearTimeout(this.retryQueue.get(request.id)!);
    }
    
    // Schedule retry
    const timeoutId = setTimeout(() => {
      console.log(` >>>>>> RetryOrchestrator: executing retry for request ${request.id}`);
      this.executeRetry(request.id);
    }, retryDelay);
    
    this.retryQueue.set(request.id, timeoutId);
    console.log(` >>>>>> RetryOrchestrator: scheduled retry for request ${request.id} in ${retryDelay}ms (attempt ${request.attempts})`);
  }

  /**
   * Execute a retry
   * @param requestId Request ID
   */
  private async executeRetry(requestId: string): Promise<void> {
    // Clean up retry queue
    this.retryQueue.delete(requestId);
    
    // If shutting down, don't execute retry
    if (this.isShuttingDown) {
      return;
    }
    
    // Get request
    const request = this.requestRepository.getById(requestId);
    
    if (!request) {
      console.warn(`Cannot execute retry for unknown request: ${requestId}`);
      return;
    }
    
    // Update status
    request.status = RequestStatus.FORWARDING;
    this.requestRepository.update(request);
    
    try {
      // Execute request
      await this.proxyExecutor.executeRequest(request);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      request.lastError = errorMessage;
      
      // For network errors after several attempts, handle directly instead of publishing event
      if (request.attempts >= 3 && 
          (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connect'))) {
        console.log(`Network error persisting after ${request.attempts} attempts, completing as failed without event publishing for ${requestId}`);
        this.groupRepository.recordFailure(request.groupKey);
        this.completeRequest(request, false);
        return;
      }
      
      // Only publish event for retry consideration if not a persistent network error
      eventBus.publish({
        type: EventType.RESPONSE_RECEIVED,
        requestId: request.id,
        groupKey: request.groupKey,
        orgId: request.orgId,
        payload: {
          error: errorMessage,
          statusCode: 0
        },
        timestamp: new Date()
      });
    }
  }

  /**
   * Complete a request (success or failure)
   * @param request Request
   * @param success Whether the request was successful
   */
  private async completeRequest(request: Request, success: boolean): Promise<void> {
    // Clear any scheduled retry
    if (this.retryQueue.has(request.id)) {
      clearTimeout(this.retryQueue.get(request.id)!);
      this.retryQueue.delete(request.id);
    }
    
    // Update request status
    if (success) {
      request.markCompleted(request.responseStatus || 200, request.responseTime || 0);
    } else {
      request.markFailed(new Error(request.lastError || 'Unknown error'), request.responseStatus || 0);
      
      // If max attempts reached and dead letter service available, add to dead letters
      if (this.deadLetterService && !request.canRetry(5)) {
        try {
          await this.deadLetterService.addToDeadLetter(request);
          
          // Update status to dead lettered
          request.status = RequestStatus.DEADLETTERED;
          this.requestRepository.update(request);
          
          // Publish dead letter added event
          eventBus.publish({
            type: EventType.DEADLETTER_ADDED,
            requestId: request.id,
            groupKey: request.groupKey,
            orgId: request.orgId,
            timestamp: new Date()
          });
        } catch (error) {
          console.error(`Error adding request ${request.id} to dead letter:`, error);
        }
      }
    }
    
    // Update request in repository
    this.requestRepository.update(request);
    
    // Additional failure tracking logic
    const failureThreshold = this.settings.getFailureThreshold(request.groupKey);
    const group = this.groupRepository.get(request.groupKey);
    
    // If we've hit the failure threshold, activate cooldown
    if (group && group.failureCount >= failureThreshold) {
      const cooldownDuration = this.settings.getCooldownDuration(request.groupKey);
      console.log(`Activating cooldown for group ${request.groupKey} due to failure threshold (${group.failureCount}/${failureThreshold})`);
      this.groupRepository.activateCooldown(request.groupKey, cooldownDuration);
    }
    
    // Publish completion event
    eventBus.publish({
      type: success ? EventType.REQUEST_COMPLETED : EventType.REQUEST_FAILED,
      requestId: request.id,
      groupKey: request.groupKey,
      orgId: request.orgId,
      payload: {
        success,
        statusCode: request.responseStatus,
        responseTime: request.responseTime,
        attempts: request.attempts,
        elapsedTime: request.completedAt 
          ? request.completedAt.getTime() - request.createdAt.getTime() 
          : Date.now() - request.createdAt.getTime()
      },
      timestamp: new Date()
    });
  }

  /**
   * Cancel all scheduled retries
   */
  private cancelAllRetries(): void {
    console.log(`Cancelling ${this.retryQueue.size} scheduled retries`);
    
    for (const timeoutId of this.retryQueue.values()) {
      clearTimeout(timeoutId);
    }
    
    this.retryQueue.clear();
  }
} 