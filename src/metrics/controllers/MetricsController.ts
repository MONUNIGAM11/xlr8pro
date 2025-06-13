/**
 * Controller handling the metrics API endpoints
 */
import { Request, Response } from 'express';
import { MetricsService } from '../services/MetricsService';
import { getTimeframeMilliseconds } from '../utils/TimeUtils';

export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  /**
   * Handle /metrics/summary endpoint
   */
  public async getSummaryMetrics(req: Request, res: Response): Promise<void> {
    try {
      const summaryMetrics = await this.metricsService.getSummaryMetrics();
      // const summaryMetrics = {
      //   "summary": {
      //     "total_requests": 1000,
      //     "total_errors": 100,
      //     "total_latency": 1000
      //   }
      // }
      res.status(200).json(summaryMetrics);
    } catch (error) {
      console.error('Error generating summary metrics:', error);
      res.status(500).json({ error: 'Failed to generate metrics' });
    }
  }

  /**
   * Handle /metrics/groups endpoint
   */
  public async getGroupMetrics(req: Request, res: Response): Promise<void> {
    try {
      const groupMetrics = await this.metricsService.getGroupMetrics();
      res.status(200).json(groupMetrics);
    } catch (error) {
      console.error('Error generating group metrics:', error);
      res.status(500).json({ error: 'Failed to generate metrics' });
    }
  }

  /**
   * Handle /metrics/historical endpoint
   */
  public async getHistoricalMetrics(req: Request, res: Response): Promise<void> {
    try {
      const timeframe = req.query.timeframe as string || '1h';
      const metricName = req.query.metric as string;
      
      const historicalMetrics = await this.metricsService.getHistoricalMetrics(timeframe, metricName);
      res.status(200).json(historicalMetrics);
    } catch (error) {
      console.error('Error generating historical metrics:', error);
      res.status(500).json({ error: 'Failed to generate metrics' });
    }
  }

  /**
   * Handle /metrics/status endpoint
   */
  public async getStatusMetrics(req: Request, res: Response): Promise<void> {
    try {
      const statusMetrics = await this.metricsService.getStatusMetrics();
      res.status(200).json(statusMetrics);
    } catch (error) {
      console.error('Error generating status metrics:', error);
      res.status(500).json({ error: 'Failed to generate metrics' });
    }
  }

  /**
   * Handle /metrics/dimensional endpoint (advanced)
   */
  public async getDimensionalMetrics(req: Request, res: Response): Promise<Response | void> {
    try {
      const query = req.body;
      
      // Validate the query
      if (!query.metrics || !Array.isArray(query.metrics)) {
        return res.status(400).json({ error: 'Invalid metrics array in query' });
      }
      
      if (!query.timeRange || !query.timeRange.start || !query.timeRange.end) {
        return res.status(400).json({ error: 'Invalid timeRange in query' });
      }
      
      const results = await this.metricsService.queryDimensionalMetrics(
        query.metrics,
        query.dimensions || {},
        new Date(query.timeRange.start),
        new Date(query.timeRange.end),
        query.aggregation || 'avg'
      );
      
      res.status(200).json({ results });
    } catch (error) {
      console.error('Error querying dimensional metrics:', error);
      res.status(500).json({ error: 'Failed to query metrics' });
    }
  }

  /**
   * Handle /metrics/cooldown/insights endpoint
   */
  public async getCooldownInsights(req: Request, res: Response): Promise<void> {
    try {
      const groupKey = req.query.groupKey as string;
      const timeframe = req.query.timeframe as string || '24h';
      
      const cooldownInsights = await this.metricsService.getCooldownInsights(groupKey, timeframe);
      res.status(200).json(cooldownInsights);
    } catch (error) {
      console.error('Error generating cooldown insights:', error);
      res.status(500).json({ error: 'Failed to generate cooldown insights' });
    }
  }

  /**
   * Handle /metrics/retry/analysis endpoint
   */
  public async getRetryAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const groupKey = req.query.groupKey as string;
      const timeframe = req.query.timeframe as string || '24h';
      
      const retryAnalysis = await this.metricsService.getRetryAnalysis(groupKey, timeframe);
      res.status(200).json(retryAnalysis);
    } catch (error) {
      console.error('Error generating retry analysis:', error);
      res.status(500).json({ error: 'Failed to generate retry analysis' });
    }
  }

  /**
   * Handle /metrics/group/health endpoint
   */
  public async getGroupHealth(req: Request, res: Response): Promise<Response | void> {
    try {
      const groupKey = req.query.groupKey as string;
      if (!groupKey) {
        return res.status(400).json({ error: 'Group key is required' });
      }
      
      const healthData = await this.metricsService.getGroupHealth(groupKey);
      res.status(200).json(healthData);
    } catch (error) {
      console.error('Error generating group health data:', error);
      res.status(500).json({ error: 'Failed to generate group health data' });
    }
  }
} 