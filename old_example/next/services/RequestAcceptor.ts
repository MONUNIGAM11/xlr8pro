import http from 'http';
import { URL } from 'url';
import { Request, RequestStatus } from '../models/Request.js';
import { eventBus, EventType } from '../events/EventBus.js';
import { ThrottleReason, ThrottleResult } from './ThrottleManager.js';

/**
 * Result of header validation
 */
export interface HeaderValidationResult {
  valid: boolean;
  targetUrl?: URL;
  orgId?: string;
  groupBy?: string;
  error?: string;
}


/**
 * Dependencies for RequestAcceptor
 */
export interface RequestAcceptorDependencies {
  requestRepository: {
    add(request: Request): Request;
  };
  throttleManager: {
    canAcceptRequest(request: Request): ThrottleResult;
  };
  proxyExecutor: {
    executeRequest(request: Request): Promise<any>;
  };
}

/**
 * Service for accepting and validating incoming requests
 */
export class RequestAcceptor {
  private requestRepository: RequestAcceptorDependencies['requestRepository'];
  private throttleManager: RequestAcceptorDependencies['throttleManager'];
  private proxyExecutor: RequestAcceptorDependencies['proxyExecutor'];
  private isShuttingDown: boolean = false;

  /**
   * Create a new RequestAcceptor
   * @param {RequestAcceptorDependencies} dependencies - Dependencies
   */
  constructor(dependencies: RequestAcceptorDependencies) {
    this.requestRepository = dependencies.requestRepository;
    this.throttleManager = dependencies.throttleManager;
    this.proxyExecutor = dependencies.proxyExecutor;
    
    // Register for shutdown events
    eventBus.subscribe(EventType.SHUTDOWN_INITIATED, () => {
      this.isShuttingDown = true;
    });
    
    console.log('Request acceptor initialized');
  }

  /**
   * Handle incoming HTTP request
   * @param {http.IncomingMessage} req - HTTP request
   * @param {http.ServerResponse} res - HTTP response
   */
  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // // Log the raw request details
    // console.log(`RequestAcceptor: Incoming request to ${req.url} from ${req.socket.remoteAddress}`);
    // console.log(`RequestAcceptor: Headers: ${JSON.stringify(req.headers)}`);
    
    // Check if shutting down
    if (this.isShuttingDown) {
      this.sendErrorResponse(res, 503, 'Service is shutting down');
      return;
    }
    
    // Validate required headers
    const validationResult = this.validateHeaders(req);
    if (!validationResult.valid) {
      this.sendErrorResponse(res, 400, validationResult.error || 'Invalid request headers');
      return;
    }
    
    // Read request body
    const body = await this.readRequestBody(req);

    // Remove host header
    delete req.headers.host;
    
    // Create request object
    const request = new Request({
      orgId: validationResult.orgId!,
      groupBy: validationResult.groupBy!,
      targetUrl: validationResult.targetUrl!,
      method: req.method || 'GET',
      headers: req.headers as Record<string, string>,
      body
    });

    // console.log('Request accepted>>>>>>>>>>>>>>>>>>', request);
    
    // Check if the request can be accepted (throttling, rate limiting)
    const throttleResult = this.throttleManager.canAcceptRequest(request);
    if (!throttleResult.accepted) {
      // If request is rate limited, send appropriate response
      console.log('>>>>>>> RequestAcceptor: Request throttled', throttleResult.reason);
     

        
      const statusCode = this.mapReasonToStatusCode(throttleResult.reason);
      
      this.sendErrorResponse(res, statusCode, throttleResult.reason || 'Request cannot be accepted');
      
      // Publish rate limited event
      eventBus.publish({
        type: EventType.RATE_LIMITED,
        requestId: request.id,
        groupKey: request.groupKey,
        orgId: request.orgId,
        payload: {
          reason: throttleResult.reason
        },
        timestamp: new Date()
      });
      
      return;
    }


    // console.log('>>>>>>> RequestAcceptor: Request accepted because ThrottleResult', throttleResult);

    if (throttleResult.delayExecution) {
      // Consider Requeue Mechanism: For long delays or system restarts, consider implementing a mechanism to requeue delayed requests that might otherwise be lost
      
      // console.log('>>>>>>> RequestAcceptor: Request scheduled for delay', throttleResult.delayMs);

      request.scheduleDelay(throttleResult.delayMs!);
      this.requestRepository.add(request);
      eventBus.publish({
          type: EventType.REQUEST_DELAYED,
          requestId: request.id,
          groupKey: request.groupKey,
          orgId: request.orgId,
          timestamp: new Date()
        });

        this.sendErrorResponse(res, 429, throttleResult.reason || ThrottleReason.GROUP_COOLDOWN_BUT_ALLOWED);
        setTimeout(() => {
          this.proxyExecutor.executeRequest(request);
        }, throttleResult.delayMs!);
        console.log('>>>>>>> RequestAcceptor: Request scheduled for delay', throttleResult.delayMs);
        return;
      }
    
    // Store the request
    this.requestRepository.add(request);
    
    // Publish request accepted event
    eventBus.publish({
      type: EventType.REQUEST_ACCEPTED,
      requestId: request.id,
      groupKey: request.groupKey,
      orgId: request.orgId,
      timestamp: new Date()
    });
    
    // Send immediate success response to client
    this.sendAcceptedResponse(res, request.id);
    
    // Forward the request asynchronously
    this.proxyExecutor.executeRequest(request)
      .catch(error => {
        console.error(`Error executing request ${request.id}:`, error);
      });
  }

  /**
   * Validate required headers
   * @param {http.IncomingMessage} req - HTTP request
   * @returns {HeaderValidationResult} Validation result
   */
  private validateHeaders(req: http.IncomingMessage): HeaderValidationResult {
    const requiredHeaders = {
      'x-url': 'url',
      'x-org': 'org',
      'x-group-by': 'groupBy'
    };
    
    const headers: Record<string, string> = {};
    
    // Check for required headers
    for (const [headerName, key] of Object.entries(requiredHeaders)) {
      const headerValue = req.headers[headerName];
      
      if (!headerValue) {
        return {
          valid: false,
          error: `Missing required header: ${headerName}`
        };
      }
      
      headers[key] = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    }
    
    // Log the raw x-url header value
    // console.log(`RequestAcceptor: Raw x-url header: ${headers.url}`);
    
    // Validate URL
    try {
      const targetUrl = new URL(headers.url);
      
      // Log the parsed URL components
      // console.log(`RequestAcceptor: Parsed URL: protocol=${targetUrl.protocol}, hostname=${targetUrl.hostname}, path=${targetUrl.pathname}`);
      
      return {
        valid: true,
        targetUrl,
        orgId: headers.org,
        groupBy: headers.groupBy
      };
    } catch (error) {
      console.error(`RequestAcceptor: Error parsing URL: ${error.message}`);
      return {
        valid: false,
        error: 'Invalid URL in x-url header'
      };
    }
  }

  /**
   * Read request body
   * @param {http.IncomingMessage} req - HTTP request
   * @returns {Promise<Buffer>} Request body as buffer
   */
  private readRequestBody(req: http.IncomingMessage): Promise<Buffer> {
    return new Promise((resolve) => {
      const body: Buffer[] = [];
      
      req.on('data', (chunk) => {
        body.push(chunk);
      });
      
      req.on('end', () => {
        resolve(Buffer.concat(body));
      });
    });
  }

  /**
   * Send error response
   * @param {http.ServerResponse} res - HTTP response
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Error message
   */
  private sendErrorResponse(res: http.ServerResponse, statusCode: number, message: string): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'error', 
      code: statusCode, 
      message,
      timestamp: new Date().toISOString()
    }));
  }

  /**
   * Send accepted response
   * @param {http.ServerResponse} res - HTTP response
   * @param {string} requestId - Request ID
   */
  private sendAcceptedResponse(res: http.ServerResponse, requestId: string): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'accepted', 
      requestId,
      timestamp: new Date().toISOString(),
      message: 'Request accepted for processing'
    }));
  }

  /**
   * Map throttle reason to status code
   * @param {ThrottleReason} reason - Throttle reason
   * @returns {number} Status code
   */
  private mapReasonToStatusCode(reason: ThrottleReason): number {
    switch (reason) {
      case ThrottleReason.GROUP_COOLDOWN_BUT_ALLOWED:
        return 429;
      case ThrottleReason.GROUP_LIMIT_EXCEEDED_BUT_ALLOWED:
        return 429;
      case ThrottleReason.GROUP_LIMIT_SEVERELY_EXCEEDED:
        return 429;
      case ThrottleReason.GLOBAL_COOLDOWN_BUT_ALLOWED:
        return 429;
      case ThrottleReason.GLOBAL_CAPACITY_EXCEEDED_BUT_ALLOWED:
        return 429;
      case ThrottleReason.GLOBAL_CAPACITY_SEVERELY_EXCEEDED:
        return 429;
      default:
        return 503;
    }
  }
} 