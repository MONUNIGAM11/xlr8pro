import express from 'express';
import { requestRepository } from './state/RequestRepository';
import { groupRepository } from './state/GroupRepository';
import { settings } from './services/SettingsService';
import { ThrottleManager } from './pipeline/ThrottleManager';
import { ProxyExecutor } from './pipeline/ProxyExecutor';
import { RequestAcceptor } from './pipeline/RequestAcceptor';

const app = express();
const port = settings.get('HTTP_PORT') || 3000;

// Instantiate pipeline components
const throttleManager = new ThrottleManager(settings);
const proxyExecutor = new ProxyExecutor();
const requestAcceptor = new RequestAcceptor({
  requestRepository,
  throttleManager,
  proxyExecutor,
});

app.use(express.json());

// Accept and enqueue requests
app.post('/proxy', (req, res) => {
  requestAcceptor.handle(req, res);
});

app.get('/', (_req, res) => {
  res.send('xlr8plus proxy service running');
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/metrics', (_req, res) => {
  const metrics = require('./services/MetricsService').metricsService.getMetrics();
  res.json(metrics);
});

app.listen(port, () => {
  console.log(`xlr8plus listening on port ${port}`);
});
