/**
 * Express routes for metrics API
 */
// import express from 'express';
// import { MetricsController } from '../controllers/MetricsController';
// import { MetricsService } from '../services/MetricsService';
// import { eventBus } from '../../events/EventBus';

import express, { Router, Request, Response, NextFunction } from 'express';
import { MetricsController } from '../controllers/MetricsController';
import { MetricsService } from '../services/MetricsService';


// let metricsService = 
export function setupMetricsRoutes(
  router: Router,
  metricsService: MetricsService 
): Router {
  const metricsController = new MetricsController(metricsService);
  
  // Legacy-compatible endpoints
  router.get('/summary', (req, res) => metricsController.getSummaryMetrics(req, res));
  router.get('/groups', (req, res) => metricsController.getGroupMetrics(req, res));
  router.get('/historical', (req, res) => metricsController.getHistoricalMetrics(req, res));
  router.get('/status', (req, res) => metricsController.getStatusMetrics(req, res));
  
  // Advanced endpoints
  
  router.post('/dimensional', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await metricsController.getDimensionalMetrics(req, res);
    } catch (error) {
      next(error);
    }
  });
  
  router.get('/cooldown/insights', (req, res) => metricsController.getCooldownInsights(req, res));
  router.get('/retry/analysis', (req, res) => metricsController.getRetryAnalysis(req, res));
  // X
  // Additional endpoints will go here
  
  return router;
} 