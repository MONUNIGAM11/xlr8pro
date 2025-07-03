import http from 'http';
import https from 'https';
import { URL } from 'url';
import { Request, RequestStatus } from '../models/Request';
import { eventBus, EventType } from '../events/EventBus';

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
  body: Buffer; // Keep body as Buffer for consistency
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

    // Note: Your existing log here says the request *is not* delayed for a DELAYED status
    // which seems like a potential logic bug/typo. Assuming the intent is to check if it *should* be delayed,
    // and if not, proceed. I will leave the existing log as is for now, but it seems counter-intuitive.
     if (request.status === RequestStatus.DELAYED) {
       console.log(`>>>>>>> ProxyExecutor: this request ${request.id} was delayed`); // Log indicates it was delayed
       // Assuming delayed requests are handled elsewhere (e.g., by a scheduler)
       // If this executeRequest is only called when it's *ready* to forward, this check might need adjustment.
       // For now, assuming the intent is 'if it's currently marked as delayed, don't forward now'
       // If the intention was 'process delayed requests', the logic here needs to change.
       return; // Don't forward if status is DELAYED
     }
     console.log(`>>>>>>> ProxyExecutor: this request ${request.id} is being processed for forwarding`);


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
      payload : {'targetUrl' :request.targetUrl},
      timestamp: new Date()
    });

    try {
      // Execute the request
      const result = await this.sendRequest(request);
      console.log(`ProxyExecutor: Request ${request.id} completed with status ${result.statusCode}`);
      const responseTime = Date.now() - startTime;

      // Update request with result
      request.responseStatus = result.statusCode;
      request.responseTime = responseTime;
      request.completedAt = new Date(); 
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
      request.completedAt = new Date(); // Mark as completed on error
      this.requestRepository.update(request);

      // Publish error event
      // Note: Your original code published EventType.RESPONSE_RECEIVED on error.
      // It might be more appropriate to have a separate EventType.REQUEST_FAILED or similar,
      // but I'll keep the original type for now.
      eventBus.publish({
        type: EventType.REQUEST_FAILED, // Or consider EventType.REQUEST_FAILED
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
      // Clean up active request regardless of success or failure
      this.activeRequests.delete(request.id);
      console.log(`ProxyExecutor: Request ${request.id} finished processing.`);
    }
  }

  /**
   * Send an HTTP request
   * @param {Request} request - Request object
   * @returns {Promise<ProxyResponse>} Promise that resolves with the response
   */
  private sendRequest(request: Request): Promise<ProxyResponse> {
    return new Promise((resolve, reject) => {
      let proxyReq: http.ClientRequest; // Declare proxyReq here so it's accessible in catch/finally

      try {
        const { targetUrl, method, headers, body } = request;
        // Note: Logging the body object directly might not show its contents well
        // console.log(`>>>>>>> ProxyExecutor: sending request ${request.id} to ${targetUrl} method: ${method} headers: ${JSON.stringify(headers)} body: ${body}`);

        // Parse URL if it's a string
        const url = typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl;

        // Check if URL is valid
        if (!url || !url.hostname) { // Added hostname check
          throw new Error('Invalid or missing target URL');
        }

        // Choose protocol based on URL
        const protocol = url.protocol === 'https:' ? https : http;
        if (!protocol) {
             throw new Error(`Unsupported protocol: ${url.protocol}`);
        }


        // Create a copy of headers to avoid modifying the original
        const requestHeaders = { ...headers };

        // Set the correct Host header to match the target hostname
        // Ensure content-length is handled correctly, especially if we modify the body
        // If we stringify the body, we should update Content-Length.
        // However, since the original came with CL=13 and we expect JSON.stringify to also produce 13 chars for {"foo":"bar"},
        // for this specific case, the original CL is fine. For general cases, recalculate.
        // Let's ensure we don't send a Content-Length if the body is empty after processing.

        // Remove the original Content-Length header for now, we'll set it based on the processed body
        delete requestHeaders['content-length'];
        delete requestHeaders['Content-Length']; // Handle different casing

        console.log(`ProxyExecutor: Forwarding request ${request.id} to ${url.href} (protocol: ${url.protocol})`);

        // Prepare request options
        const options: http.RequestOptions = { // Use http.RequestOptions for type safety
          method: method,
          hostname: url.hostname,
          port: url.port ? parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 80), // Parse port to number
          path: url.pathname + url.search,
          headers: requestHeaders, // Use our possibly modified headers
          // servername: url.hostname, // Critical: This ensures the TLS SNI field is set correctly for certificate validation
          host: url.hostname // Host option (redundant with hostname but sometimes used)
        };

        console.log(`ProxyExecutor: Request ${request.id} - Connection options:`, JSON.stringify(options, null, 2));

        // Create request
        proxyReq = protocol.request(options, (proxyRes) => {
          const responseData: Buffer[] = [];
          let responseSize = 0;

          proxyRes.on('data', (chunk: Buffer) => {
            responseData.push(chunk);
            responseSize += chunk.length; // Track size
          });

          proxyRes.on('end', () => {
            const responseBuffer = Buffer.concat(responseData);
            const statusCode = proxyRes.statusCode || 0;

             // Log response status and size
            console.log(`ProxyExecutor: Request ${request.id} completed with status ${statusCode} (${responseSize} bytes)`);

            resolve({
              statusCode,
              headers: proxyRes.headers,
              responseSize: responseSize, // Use the tracked size
              body: responseBuffer // Resolve with the full response body buffer
            });
          });

           // Handle response errors (e.g., network issues during response data transfer)
           proxyRes.on('error', (error) => {
               const errorMessage = error.message || 'Unknown response error';
               const errorCode = (error as any).code || 'UNKNOWN_RES';
               console.error(`ProxyExecutor: Response Error for request ${request.id} from ${url.href}: ${errorCode} - ${errorMessage}`);
               // Reject the promise with the error
               reject(error);
           });
        });

        // Handle request errors (e.g., connection refused, DNS error, socket hang up during request send)
        proxyReq.on('error', (error) => {
          const errorMessage = error.message || 'Unknown request error';
          const errorCode = (error as any).code || 'UNKNOWN_REQ';

          console.error(`ProxyExecutor: Request Error for request ${request.id} to ${url.href}: ${errorCode} - ${errorMessage}`);

          // Detailed error logging for SSL/TLS issues
          if (errorCode === 'CERT_HAS_EXPIRED' || errorCode === 'ERR_TLS_CERT_ALTNAME_INVALID' || errorCode === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
            console.error(`ProxyExecutor: SSL/TLS validation error - target: ${url.hostname}, error: ${errorMessage}`);
             // Note: In production, you might want better cert handling or options.rejectUnauthorized = false (use with caution!)
          }

          // Reject the promise with the error
          reject(error);
        });

        // Set timeout for the request itself (connection + sending + waiting for headers)
        // The response 'data' and 'end' events have their own implicit timeouts tied to the socket.
        // This 30s timeout is good for the initial connection and getting the response headers.
        proxyReq.setTimeout(30000, () => {
          proxyReq.destroy(); // Destroy the socket
          const timeoutError = new Error('Request timed out');
          (timeoutError as any).code = 'ETIMEDOUT'; // Add a standard code
          console.error(`ProxyExecutor: Request ${request.id} to ${url.href} timed out after 30s`);
          reject(timeoutError);
        });

        // --- NEW/MODIFIED BODY HANDLING ---
        // Send request body if available
        if (body !== null && body !== undefined) {
          let dataToSend: string | Buffer;

          if (typeof body === 'object') {
            // If body is an object (e.g., from parsed JSON), stringify it
            try {
              dataToSend = JSON.stringify(body);
               // Update Content-Length header to match the stringified body size
               // This is important if the original body was not stringified JSON or had different encoding
               // For {"foo":"bar"}, this is 13 bytes, matching the original, but doing this is more robust.
               options.headers!['Content-Length'] = Buffer.byteLength(dataToSend).toString();
            } catch (e) {
              const stringifyError = new Error('Failed to stringify request body: ' + (e as Error).message);
              console.error(`ProxyExecutor: Error stringifying body for request ${request.id}:`, stringifyError);
              // Abort the request setup and reject the promise
              // If proxyReq was already created, destroy it. If not, just reject.
              if (proxyReq) proxyReq.destroy(stringifyError);
              return reject(stringifyError); // Use return to stop execution here
            }
          } else if (typeof body === 'string' || (body as any) instanceof Buffer) {
            // If body is already a string or Buffer, use it directly
            dataToSend = body;
             // Update Content-Length header based on the size of the string or buffer
             options.headers!['Content-Length'] = Buffer.byteLength(dataToSend).toString();
          } else {
             // Handle unexpected body types if necessary, or just log/ignore
             console.warn(`ProxyExecutor: Unexpected body type for request ${request.id}: ${typeof body}`);
             // Assume no body to send in this case
             dataToSend = ''; // Or just skip the write call below
          }

          // Write the processed body data
          if (dataToSend) { // Only write if there is data to send
             console.log(`ProxyExecutor: Writing ${Buffer.byteLength(dataToSend)} bytes of body data for request ${request.id}`);
             proxyReq.write(dataToSend);
          } else {
             // If body existed but was empty after processing (e.g., empty string after stringify)
             // ensure Content-Length is '0' if it's a POST/PUT etc.
             if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
                 options.headers!['Content-Length'] = '0';
             } else {
                // For methods that typically don't have a body (GET, HEAD, DELETE),
                // explicitly setting Content-Length can be wrong.
                // Ensure it's absent if no body is written.
                 delete options.headers!['Content-Length'];
             }
          }

        } else {
           // If request.body was originally null or undefined
            // For methods that typically don't have a body (GET, HEAD, DELETE), ensure CL is absent.
            // For methods that *can* have a body but this request didn't (POST, PUT), CL should be 0.
             if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
                 options.headers!['Content-Length'] = '0';
             } else {
                 delete options.headers!['Content-Length'];
             }
        }

        // --- END NEW/MODIFIED BODY HANDLING ---


        // End the request - this sends the headers and flushes any written body data
        // This MUST be called, even if there's no body.
        proxyReq.end();

      } catch (error) {
        // Catch errors during initial setup (URL parsing, options creation, protocol.request call)
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`ProxyExecutor: Exception during request setup for request ${request.id}: ${errorMessage}`);
        // Ensure proxyReq is destroyed if it was created before the error
        if (proxyReq && !proxyReq.destroyed) {
             try { proxyReq.destroy(); } catch(e) { console.error("Error destroying proxyReq:", e); }
        }
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