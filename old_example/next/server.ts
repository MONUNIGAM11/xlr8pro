import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { settings } from './services/SettingsService.js';
import { RequestAcceptor } from './services/RequestAcceptor.js';
import { eventBus, EventType } from './events/EventBus.js';
import { requestRepository } from './repositories/RequestRepository.js';
import { groupRepository } from './repositories/GroupRepository.js';
import { ThrottleManager } from './services/ThrottleManager.js';
import { ProxyExecutor } from './services/ProxyExecutor.js';
import express from 'express';
import { EventEmitter } from 'events';
import { bootstrapMetricsSystem } from './metrics/bootstrap.js';

import { RetryOrchestrator } from './services/RetryOrchestrator.js';

// Controllers map for routing
interface Controllers {
  requestAcceptor: RequestAcceptor;
  dashboardController?: any;
  metricsController?: any;
  deadletterController?: any;
  healthController?: any;
}

/**
 * Initialize application
 */
async function initializeApp(): Promise<Controllers> {
  console.log('Initializing xlr8plus Next...');
  
  // Initialize services
  const throttleManager = new ThrottleManager({
    requestRepository,
    groupRepository,
    settings
  });
  
  const proxyExecutor = new ProxyExecutor({
    requestRepository
  });
  
  const retryOrchestrator = new RetryOrchestrator({
    requestRepository,
    proxyExecutor,
    groupRepository,
    settings
  });
  
  const requestAcceptor = new RequestAcceptor({
    requestRepository,
    throttleManager,
    proxyExecutor
  });
  
  const app = express();
  // const eventEmitter = new EventEmitter();
  
  let metricsController;
  if (settings.get('ENABLE_METRICS') === 'true') {
    try {
      const metrics = await bootstrapMetricsSystem(
        app, 
        eventBus,
        {
          capacityService: throttleManager,
          groupService: groupRepository
        },
        {
          metricsPath: '/metrics',
          mongoUri: settings.get('MONGODB_URI'),
          flushIntervalMs: 15000,
          memoryTimeSeriesCapacity: 1000,
          systemMetricsInterval: 15000,
        }
      );
      
      metricsController = metrics.service;
      console.log('Metrics system initialized');
    } catch (error) {
      console.error('Failed to initialize metrics system:', error);
    }
  }
  
  // Return controllers
  return {
    requestAcceptor,
    metricsController
  };
}

/**
 * Create HTTP server
 * @returns {Promise<http.Server>} HTTP server
 */
export async function createServer(): Promise<http.Server> {
  console.log('Creating HTTP server (next implementation)');
  
  const controllers = await initializeApp();
  
  return http.createServer((req, res) => {
    // Route request to appropriate controller
    routeRequest(req, res, controllers);
  });
}

/**
 * Create HTTPS server
 * @returns {Promise<https.Server>} HTTPS server
 */
export async function createHttpsServer(): Promise<https.Server> {
  console.log('Creating HTTPS server (next implementation)');
  
  const controllers = await initializeApp();
  
  const certPath = path.join(process.cwd(), 'var/cert/proxy.pem');
  console.log(`Using cert: ${certPath}`);
  
  try {
    const options = {
      key: fs.readFileSync(certPath),
      cert: fs.readFileSync(certPath)
    };
    
    return https.createServer(options, (req, res) => {
      // Route request to appropriate controller
      routeRequest(req, res, controllers);
    });
  } catch (error) {
    console.error('Error creating HTTPS server:', error);
    throw error;
  }
}

/**
 * Route request to appropriate controller
 * @param {http.IncomingMessage} req - HTTP request
 * @param {http.ServerResponse} res - HTTP response
 * @param {Controllers} controllers - Request controllers
 */
function routeRequest(
  req: http.IncomingMessage, 
  res: http.ServerResponse,
  controllers: Controllers
): void {
  try {
    const url = req.url || '/';
    
    // Route based on URL path
    if (url.startsWith('/dash')) {
      if (controllers.dashboardController) {
        controllers.dashboardController.handleRequest(req, res);
      } else {
        sendNotImplementedResponse(res, 'Dashboard controller not implemented');
      }
    } else if (url.startsWith('/metrics')) {
      if (controllers.metricsController) {
        controllers.metricsController.handleRequest(req, res);
      } else {
        sendNotImplementedResponse(res, 'Metrics controller not implemented');
      }
    } else if (url.startsWith('/deadletter')) {
      if (controllers.deadletterController) {
        controllers.deadletterController.handleRequest(req, res);
      } else {
        sendNotImplementedResponse(res, 'Deadletter controller not implemented');
      }
    } else if (url === '/health') {
      if (controllers.healthController) {
        controllers.healthController.handleRequest(req, res);
      } else {
        // Basic health check response
        sendHealthCheckResponse(res);
      }
    } else {
      // Default route - proxy requests
      controllers.requestAcceptor.handleRequest(req, res);
    }
  } catch (error) {
    console.error('Error routing request:', error);
    
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }));
    }
  }
}

/**
 * Send not implemented response
 * @param {http.ServerResponse} res - HTTP response
 * @param {string} message - Error message
 */
function sendNotImplementedResponse(res: http.ServerResponse, message: string): void {
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ 
    error: 'Not implemented',
    message,
    timestamp: new Date().toISOString()
  }));
}

/**
 * Send health check response
 * @param {http.ServerResponse} res - HTTP response
 */
function sendHealthCheckResponse(res: http.ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.VERSION || '1.0.0',
    implementation: 'next'
  }));
}

/**
 * Start HTTP server
 */
async function startHttpServer(): Promise<void> {
  try {
    const server = await createServer();
    const port = settings.get('HTTP_PORT');
    
    server.listen(port, () => {
      console.log(`HTTP server (next implementation) listening on port ${port}`);
    });
    
    // Graceful shutdown handling
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down HTTP server');
      server.close(() => {
        console.log('HTTP server closed');
      });
    });
  } catch (error) {
    console.error('Failed to start HTTP server:', error);
  }
}

/**
 * Start HTTPS server
 */
async function startHttpsServer(): Promise<void> {
  try {
    const server = await createHttpsServer();
    const port = settings.get('HTTPS_PORT');
    
    server.listen(port, () => {
      console.log(`HTTPS server (next implementation) listening on port ${port}`);
    });
    
    // Graceful shutdown handling
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down HTTPS server');
      server.close(() => {
        console.log('HTTPS server closed');
      });
    });
  } catch (error) {
    console.error('Failed to start HTTPS server:', error);
  }
}

// Run the application if this is the main module
// In ES modules, we can't use require.main === module
// Instead, we can check if import.meta.url is the same as process.argv[1]
const isMainModule = import.meta.url.startsWith('file:') ? 
  import.meta.url === `file://${process.argv[1]}` : false;

if (isMainModule) {
  startHttpServer();
  startHttpsServer();
  
  console.log('xlr8plus Next implementation started');
  
  // Publish application started event
  eventBus.publish({
    type: EventType.SHUTDOWN_INITIATED,
    timestamp: new Date(),
    payload: {
      httpPort: settings.get('HTTP_PORT'),
      httpsPort: settings.get('HTTPS_PORT')
    }
  });
}

//export { createServer, createHttpsServer }; 