import { MetricsStateCollector } from "./collection/MetricsStateCollector";

import express from 'express';
import { EventEmitter } from 'events';
import { MetricsService, } from './services/MetricsService';
import { MetricsRepository } from './interfaces/MetricsRepository';
import { setupMetricsRoutes } from './routes/metricsRoutes';
import { initializeMetricsSystem } from './index';
import { EventBus } from "../events/EventBus";


export async function bootstrapMetricsSystem(
  app: express.Application,
  eventEmitter: EventBus,
  services: {
    capacityService?: any,
    queueService?: any,
    cooldownService?: any,
    groupService?: any
  },
  config: {
    mongoUri?: string,
    flushIntervalMs?: number,
    memoryTimeSeriesCapacity?: number,
    systemMetricsInterval?: number,
    groupMetricsInterval?: number,
    metricsPath?: string,
    // other config options
  }
): Promise<{ 
  repository: MetricsRepository,
  service: MetricsService,
  shutdown: () => Promise<void>
}> {
  // Initialize repository
  const { repository } = await initializeMetricsSystem(config.mongoUri, {});
  
  // Create service
  const service = new MetricsService(
    eventEmitter,
    config.mongoUri ? repository : null,
    {
      flushIntervalMs: config.flushIntervalMs || 15000,
      timeSeriesCapacity: config.memoryTimeSeriesCapacity || 1000,
    }
  );
  
  // Setup state collector
  const stateCollector = new MetricsStateCollector(
    repository,
    { 
      systemIntervalMs: config.systemMetricsInterval || 15000,
      groupsIntervalMs: config.groupMetricsInterval || 30000
    },
    services
  );
  stateCollector.start();
  
  // Setup routes
  const router = express.Router();
  const metricsRouter = setupMetricsRoutes(router, service);
  app.use(config.metricsPath || '/metrics', metricsRouter);
  
  // Create shutdown function
  const shutdown = async () => {
    stateCollector.stop();
    service.shutdown();
    if ('shutdown' in repository) {
      await (repository as any).shutdown();
    }
  };
  
  return { repository, service, shutdown };
}
