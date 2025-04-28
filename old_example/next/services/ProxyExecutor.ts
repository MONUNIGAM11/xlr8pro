import http from 'http';
import https from 'https';
import { URL } from 'url';
import { Request, RequestStatus } from '../models/Request.js';
import { eventBus, EventType } from '../events/EventBus.js';

/**
 * ProxyExecutor options
 */
export interface ProxyExecutorOptions {
  requestRepository: {
    getById(id: string): Request | undefined;
    update(request: Request): Request;
  };
}

/**
 * Response from proxy request
 */
export interface ProxyResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  responseSize: number;
  body: Buffer;
}

/**
 * Service for executing proxy requests to target services
 */
export class ProxyExecutor {
  private requestRepository: ProxyExecutorOptions['requestRepository'];
  private activeRequests: Set<string> = new Set();
  private isShuttingDown: boolean = false;

  /**
   * Create a new ProxyExecutor
   * @param {ProxyExecutorOptions} options - Options
   */
  constructor(options: ProxyExecutorOptions) {
    this.requestRepository = options.requestRepository;
    
    // Register for shutdown events
    eventBus.subscribe(EventType.SHUTDOWN_INITIATED, () => this.handleShutdown());
    
    console.log('Proxy executor initialized');
  }

  /**
   * Execute a proxy request
   * @param {Request|string} request - Request object or ID
   * @returns {Promise<ProxyResponse>} Promise that resolves with the response
   */
  async executeRequest(request: Request | string): Promise<ProxyResponse> {
    if (this.isShuttingDown) {
      throw new Error('System is shutting down, cannot execute requests');
    }

    
    // Get and update request if ID is provided instead of object
    if (typeof request === 'string') {
      const requestId = request;
      const foundRequest = this.requestRepository.getById(requestId);
      
      if (!foundRequest) {
        throw new Error(`Request ${requestId} not found`);
      }

      request = foundRequest;
    }

    if (request.status === RequestStatus.DELAYED) {
      console.log(`>>>>>>> ProxyExecutor: this request ${request.id} was delayed`);
      return;
    }
    console.log(`>>>>>>> ProxyExecutor: this request ${request.id} is not delayed`);
    
    // Update request status
    request.status = RequestStatus.FORWARDING;
    this.requestRepository.update(request);
    
    // Track active request
    this.activeRequests.add(request.id);
    
    // Start time for metrics
    const startTime = Date.now();
    
    // Publish request forwarding event
    eventBus.publish({
      type: EventType.REQUEST_FORWARDED,
      requestId: request.id,
      groupKey: request.groupKey,
      orgId: request.orgId,
      timestamp: new Date()
    });
    
    try {
      // Execute the request
      const result = await this.sendRequest(request);
      const responseTime = Date.now() - startTime;
      
      // Update request with result
      request.responseStatus = result.statusCode;
      request.responseTime = responseTime;
      this.requestRepository.update(request);
      
      // Publish response received event
      eventBus.publish({
        type: EventType.RESPONSE_RECEIVED,
        requestId: request.id,
        groupKey: request.groupKey,
        orgId: request.orgId,
        payload: {
          statusCode: result.statusCode,
          responseTime,
          responseSize: result.responseSize,
          headers: result.headers
        },
        timestamp: new Date()
      });
      
      return result;
    } catch (error) {
      // Update request with error
      const errorMessage = error instanceof Error ? error.message : String(error);
      request.lastError = errorMessage;
      this.requestRepository.update(request);
      
      // Publish error event
      eventBus.publish({
        type: EventType.RESPONSE_RECEIVED,
        requestId: request.id,
        groupKey: request.groupKey,
        orgId: request.orgId,
        payload: {
          error: errorMessage,
          code: (error as any).code,
          responseTime: Date.now() - startTime
        },
        timestamp: new Date()
      });
      
      throw error;
    } finally {
      // Clean up
      this.activeRequests.delete(request.id);
    }
  }

  /**
   * Send an HTTP request
   * @param {Request} request - Request object
   * @returns {Promise<ProxyResponse>} Promise that resolves with the response
   */
  private sendRequest(request: Request): Promise<ProxyResponse> {
    return new Promise((resolve, reject) => {
      try {
        const { targetUrl, method, headers, body } = request;
        
        // Parse URL if it's a string
        const url = typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl;
        
        // Check if URL is valid
        if (!url) {
          throw new Error('Invalid or missing target URL');
        }
        
        // // Log very detailed information about the request
        // console.log(`ProxyExecutor: Request ${request.id} - Raw target URL: ${typeof targetUrl === 'string' ? targetUrl : url.href}`);
        // console.log(`ProxyExecutor: Request ${request.id} - Connecting to: ${url.hostname}:${url.port || (url.protocol === 'https:' ? 443 : 80)}`);
        
        // Choose protocol based on URL
        const protocol = url.protocol === 'https:' ? https : http;
        
        // Create a copy of headers to avoid modifying the original
        const requestHeaders = { ...headers };
        
        // Set the correct Host header to match the target hostname
        requestHeaders.host = url.hostname;
        
        // // Log the request being made
        // console.log(`ProxyExecutor: Forwarding request ${request.id} to ${url.href} (protocol: ${url.protocol})`);
        
        // Prepare request options
        const options = {
          method: method,
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          headers: requestHeaders,
          servername: url.hostname, // Critical: This ensures the TLS SNI field is set correctly for certificate validation
          host: url.hostname
        };
        
        // console.log(`ProxyExecutor: Request ${request.id} - Connection options:`, JSON.stringify(options, null, 2));
        
        // Create request
        const proxyReq = protocol.request(options, (proxyRes) => {
          const responseData: Buffer[] = [];
          
          proxyRes.on('data', (chunk: Buffer) => {
            responseData.push(chunk);
          });
          
          proxyRes.on('end', () => {
            const responseBuffer = Buffer.concat(responseData);
            const statusCode = proxyRes.statusCode || 0;
            if (!(statusCode >= 200 && statusCode < 300)) {
              console.log(`ProxyExecutor: Request ${request.id} completed with status ${statusCode} (${responseBuffer.length} bytes)`);
            }
            
            resolve({
              statusCode,
              headers: proxyRes.headers,
              responseSize: responseBuffer.length,
              body: responseBuffer
            });
          });
        });
        
        // Handle errors
        proxyReq.on('error', (error) => {
          const errorMessage = error.message || 'Unknown error';
          const errorCode = (error as any).code || 'UNKNOWN';
          
          console.error(`ProxyExecutor: Error with request ${request.id} to ${url.href}: ${errorCode} - ${errorMessage}`);
          
          // Detailed error logging for SSL/TLS issues
          if (errorCode === 'CERT_HAS_EXPIRED' || errorCode === 'ERR_TLS_CERT_ALTNAME_INVALID') {
            console.error(`ProxyExecutor: SSL/TLS validation error - target: ${url.hostname}, error: ${errorMessage}`);
          }
          
          reject(error);
        });
        
        // Set timeout
        proxyReq.setTimeout(30000, () => {
          proxyReq.destroy();
          console.error(`ProxyExecutor: Request ${request.id} to ${url.href} timed out after 30s`);
          reject(new Error('Request timed out'));
        });
        
        // Send request body if available
        if (body) {
          proxyReq.write(body);
        }
        
        proxyReq.end();
      } catch (error) {
        console.error(`ProxyExecutor: Exception during request setup: ${error.message}`);
        reject(error);
      }
    });
  }

  /**
   * Handle system shutdown
   */
  private handleShutdown(): void {
    this.isShuttingDown = true;
    console.log(`ProxyExecutor shutting down with ${this.activeRequests.size} active requests`);
    
    // We don't cancel active requests, just stop accepting new ones
    // The active requests will complete naturally
  }

  /**
   * Get the count of currently active requests
   * @returns {number} Number of active requests
   */
  getActiveRequestCount(): number {
    return this.activeRequests.size;
  }
} 