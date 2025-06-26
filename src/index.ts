import express from 'express';
// import { requestRepository } from './state/RequestRepository';
import { requestRepository } from './repositories/RequestRepository';

import { groupRepository } from './repositories/GroupRepository';
import { settings } from './services/SettingsService';
import { ThrottleManager } from './services/ThrottleManager';
import { ProxyExecutor } from './services/ProxyExecutor';
import { RequestAcceptor } from './services/RequestAcceptor';
// import { metricsService } from './services/MetricsService'; // Remove old metrics service import
import { bootstrapMetricsSystem } from './metrics/bootstrap'; // Import new bootstrap function
import { eventBus } from './events/EventBus'; // Import eventBus (assuming this is the correct path)
import { RetryOrchestrator } from './services/RetryOrchestrator';


const app = express();
const port = settings.get('HTTP_PORT') || 3000;

// Instantiate pipeline components
const throttleManager = new ThrottleManager({
  requestRepository,
  groupRepository,
  settings
});


const proxyExecutor = new ProxyExecutor({
  requestRepository: requestRepository, 
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
  proxyExecutor,
  // retryOrchestrator
});

// app.use(express.json());
console.log(groupRepository,'groupRepository');
// Accept and enqueue requests
app.post('/proxy', (req, res) => {
  requestAcceptor.handleRequest(req, res);
});

app.get('/', (_req, res) => {
  res.send('xlr8plus proxy service running');
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// --- Old metrics endpoint to be removed ---
// app.get('/metrics', (_req, res) => {
//   const metricsData = require('./services/MetricsService').metricsService.getMetrics();
//   console.log('Metrics:', metricsData);
//   let metrics = {
//     status: 'ok',
//     metrics: metricsService.getMetrics()
//   }
//   res.json(metrics);
// });
// --- End of old metrics endpoint ---

// Bootstrap the new metrics system
async function startApp() {
  // Pass empty services for now as they are not implemented
  const { repository, service, shutdown } = await bootstrapMetricsSystem(
    app,
    eventBus,
    {},
    {
      metricsPath: '/metrics', // Mount metrics API at /metrics
      mongoUri: undefined,
      // Other configuration can be added here
    }
  );

  // The metrics routes are mounted by bootstrapMetricsSystem, no need to add app.use here

  app.listen(port, () => {
    console.log(`xlr8plus listening on port ${port}`);
  });

  // You might want to store 'shutdown' if graceful shutdown is needed
  // process.on('SIGTERM', async () => {
  //   console.log('Received SIGTERM. Shutting down metrics system...');
  //   await shutdown();
  //   process.exit(0);
  // });
}

startApp(); // Start the application
