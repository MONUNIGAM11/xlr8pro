import { createServer, createHttpsServer } from './server.js';

/**
 * Initialize the next implementation
 * This can be called from the main application to start using the next implementation
 */
export async function initializeNext() {
  return {
    createServer,
    createHttpsServer
  };
}

// Export key components for integration
export { eventBus } from './events/EventBus.js';
export { requestRepository } from './repositories/RequestRepository.js';
export { groupRepository } from './repositories/GroupRepository.js';
export { settings } from './services/SettingsService.js';

// Export server functions
export { createServer, createHttpsServer } from './server.js';

// Initialize any necessary services here
console.log('Initializing xlr8plus Next implementation');

