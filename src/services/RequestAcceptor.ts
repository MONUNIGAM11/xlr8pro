import http from 'http';
import { URL } from 'url';
import { Request, RequestStatus } from '../models/Request';
import { eventBus } from '../events/EventBus';
import { ThrottleReason, ThrottleResult } from './ThrottleManager';
import { EventType } from '../events/EventBus';


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

  // Add a constant for max body size (1MB)
  private static readonly MAX_BODY_SIZE = 1024 * 1024; // 1MB

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
   * Helper to publish events in a consistent way
   */
    private publishEvent(type: EventType, data: Partial<{ requestId: string; groupKey: string; orgId: string; payload: any; }>) {
      console.log("aur publish hua hai ye = ", type)
      eventBus.publish({
        type,
        requestId: data.requestId,
        groupKey: data.groupKey,
        orgId: data.orgId,
        payload: data.payload,
        timestamp: new Date()
      });
    }


  /**
   * Handle incoming HTTP request
   * @param {http.IncomingMessage} req - HTTP request
   * @param {http.ServerResponse} res - HTTP response
   * @param {string | undefined} providedId - Optional request ID from the incoming request
   */
  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.logIncomingRequest(req);
    let requestId = crypto.randomUUID();
    

    
    
    if (this.isShuttingDown) {
      this.sendErrorResponse(res, 503, 'Service is shutting down');
      return;
    }
    
    const validationResult = this.validateAndRespondOnError(req, res);
    if (!validationResult) return;
    
    // emit event for request received
    this.publishEvent(EventType.REQUEST_RECEIVED, { requestId, orgId: validationResult.orgId, groupKey: validationResult.groupBy });

    const parsedBody = await this.parseBodyAndRespondOnError(req, res);
    if (!parsedBody) return;

    this.removeHostHeader(req);
    const request = this.createRequestObject(req, requestId, validationResult, parsedBody);
    console.log('Request accepted>>>>>>>>>>>>>>>>>>', request);

    // --- Example: Configuration change event publishing ---
    // if (configChanged) {
    //   this.publishEvent(EventType.CONFIGURATION_CHANGED, { payload: { changedBy: 'admin', changes: { ... } } });
    // }

    // --- Example: Plugin events ---
    // this.publishEvent(EventType.PLUGIN_LOADED, { payload: { pluginName: 'myPlugin' } });
    // this.publishEvent(EventType.PLUGIN_ERROR, { payload: { pluginName: 'myPlugin', error: 'Stack trace...' } });

    // --- Example: Data backup events ---
    // this.publishEvent(EventType.DATA_BACKUP_STARTED, { payload: { startedBy: 'system' } });
    // this.publishEvent(EventType.DATA_BACKUP_COMPLETED, { payload: { completedBy: 'system' } });

    const throttleResult = this.throttleManager.canAcceptRequest(request);
    if (!throttleResult.accepted) {
      this.handleThrottledRequest(res, request, throttleResult);
      return;
    }

    if (throttleResult.delayExecution) {
      this.handleDelayedRequest(res, request, throttleResult);
      return;
    }

    this.acceptAndForwardRequest(res, request);
  }

  // --- Helper Methods ---

  private logIncomingRequest(req: http.IncomingMessage) {
    console.log(`RequestAcceptor: Incoming request to ${req.url} from ${req.socket.remoteAddress}`);
    console.log(`RequestAcceptor: Headers: ${JSON.stringify(req.headers)}`);
  }

  private validateAndRespondOnError(req: http.IncomingMessage, res: http.ServerResponse) {
    const validationResult = this.validateHeaders(req);
    if (!validationResult.valid) {
      this.publishEvent(EventType.REQUEST_MALFORMED, { payload: { reason: validationResult.error || 'Invalid request headers' } });
      this.sendErrorResponse(res, 400, validationResult.error || 'Invalid request headers');
      return null;
    }
    console.log('RequestAcceptor: Headers validated successfully');
    return validationResult;
  }

  private async parseBodyAndRespondOnError(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = await this.readRequestBody(req);
    let parsedBody;
    try {
      if (body) {
        parsedBody = JSON.parse(body.toString());
      } else {
        this.publishEvent(EventType.REQUEST_MALFORMED, { payload: { reason: 'Empty request body' } });
        this.sendErrorResponse(res, 400, 'Empty request body');
        return null;
      }
    } catch (error) {
      this.publishEvent(EventType.REQUEST_MALFORMED, { payload: { reason: 'Invalid JSON body' } });
      this.sendErrorResponse(res, 400, 'Invalid JSON body');
      return null;
    }
    console.log('RequestAcceptor: Request body:', parsedBody);
    return parsedBody;
  }

  private removeHostHeader(req: http.IncomingMessage) {
    delete req.headers.host;
    console.log('RequestAcceptor: Host header removed');
  }

  private createRequestObject(req: http.IncomingMessage, requestId: string, validationResult: any, parsedBody: any) {
    return new Request({
      id:requestId,
      orgId: validationResult.orgId!,
      groupBy: validationResult.groupBy!,
      targetUrl: validationResult.targetUrl!,
      method: req.method || 'GET',
      headers: req.headers as Record<string, string>,
      body: parsedBody
    });
  }

  private handleThrottledRequest(res: http.ServerResponse, request: any, throttleResult: any) {
    console.log('>>>>>>> RequestAcceptor: Request throttled', throttleResult.reason);
    const statusCode = this.mapReasonToStatusCode(throttleResult.reason);
    this.sendErrorResponse(res, statusCode, throttleResult.reason || 'Request cannot be accepted');
    this.publishEvent(EventType.RATE_LIMITED, {
      requestId: request.id,
      groupKey: request.groupKey,
      orgId: request.orgId,
      payload: { reason: throttleResult.reason },
    });
    this.publishEvent(EventType.RATE_LIMIT_EXCEEDED, {
      requestId: request.id,
      groupKey: request.groupKey,
      orgId: request.orgId,
      payload: { reason: throttleResult.reason },
    });
  }

  private handleDelayedRequest(res: http.ServerResponse, request: any, throttleResult: any) {
    request.scheduleDelay(throttleResult.delayMs!);
    this.requestRepository.add(request);
    this.publishEvent(EventType.REQUEST_DELAYED, {
      requestId: request.id,
      groupKey: request.groupKey,
      orgId: request.orgId,
    });
    this.sendErrorResponse(res, 429, throttleResult.reason || ThrottleReason.GROUP_COOLDOWN_BUT_ALLOWED);
    setTimeout(() => {
      this.proxyExecutor.executeRequest(request);
    }, throttleResult.delayMs!);
    console.log('>>>>>>> RequestAcceptor: Request scheduled for delay', throttleResult.delayMs);
  }

  private acceptAndForwardRequest(res: http.ServerResponse, request: any) {
    this.requestRepository.add(request);
    this.publishEvent(EventType.REQUEST_ACCEPTED, {
      requestId: request.id,
      groupKey: request.groupKey,
      orgId: request.orgId,
    });
    this.sendAcceptedResponse(res, request.id);
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
 * @param {http.IncomingMessage} req 
 * @returns {Promise<Buffer>} request body as buffer
 */
  private readRequestBody(req: http.IncomingMessage): Promise<Buffer> {
    console.log('RequestAcceptor: Reading request body');
    return new Promise((resolve, reject) => {
      const body: Buffer[] = [];
      let totalLength = 0;
      const timeout = setTimeout(() => {
        reject(new Error('Request body read timeout'));
      }, 10000); // 10 seconds

      req.on('data', (chunk) => {
        console.log('Received chunk:' ,chunk);
        body.push(chunk);
      });

      req.on('end', () => {
        clearTimeout(timeout);
        if (body.length === 0) {
          console.log('RequestAcceptor: Empty request body');
          resolve(Buffer.alloc(0)); //Return an empty
        } else {
          resolve(Buffer.concat(body));
        }
      });

      req.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
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
    // Publish RESPONSE_SENT event for error responses
    this.publishEvent(EventType.RESPONSE_SENT, { payload: { statusCode, message } });
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
    // Publish RESPONSE_SENT event for success responses
    this.publishEvent(EventType.RESPONSE_SENT, { requestId, payload: { statusCode: 200 } });
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