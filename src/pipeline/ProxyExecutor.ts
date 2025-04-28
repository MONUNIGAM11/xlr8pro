import { Request } from '../models/Request';
import { Agent } from 'undici';

// Create a single global undici Agent for connection pooling and HTTP/2 multiplexing
const agent = new Agent({
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 60_000,
  connections: 1000,
  pipelining: 1, // For HTTP/1.1 pipelining, ignored for HTTP/2
  // Undici will negotiate HTTP/2 and multiplex automatically if the server supports it
});

export class ProxyExecutor {
  async executeRequest(request: Request): Promise<void> {
    const targetUrl = (request as any).targetUrl || request.payload?.targetUrl;
    if (targetUrl) {
      try {
        // Use undici fetch with the global agent for pooling and multiplexing
        const res = await fetch(targetUrl, {
          method: 'POST',
          body: JSON.stringify(request.payload),
          headers: { 'content-type': 'application/json' },
          dispatcher: agent,
        });
        // HTTP version is available on the response's internal symbol in undici
        // @ts-ignore
        const httpVersion = res[Symbol.for('undici.response.httpVersion')];
        const responseBody = await res.text();
        console.log(`Proxy executed for request ${request.id}, status: ${res.status}, httpVersion: ${httpVersion}`);
      } catch (err) {
        console.error(`Proxy error for request ${request.id}:`, err);
      }
    } else {
      setTimeout(() => {
        console.log(`Proxy executed for request ${request.id}`);
      }, 100);
    }
  }
}
