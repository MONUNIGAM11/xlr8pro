/**
 * Event types enumeration for system events
 */
// export enum MetricsEventType {
//   REQUEST_RECEIVED = 'request_received',
//   REQUEST_VALIDATED = 'request_validated',
//   REQUEST_ACCEPTED = 'request_accepted',
//   REQUEST_FORWARDED = 'request_forwarded',
//   REQUEST_DELAYED = 'request_delayed',
//   RESPONSE_RECEIVED = 'response_received',
//   RETRY_SCHEDULED = 'retry_scheduled',
//   COOLDOWN_ACTIVATED = 'cooldown_activated',
//   COOLDOWN_EXPIRED = 'cooldown_expired',
//   RATE_LIMITED = 'rate_limited',
//   REQUEST_COMPLETED = 'request_completed',
//   REQUEST_FAILED = 'request_failed',
//   DEADLETTER_ADDED = 'deadletter_added',
//   CAPACITY_UPDATED = 'capacity_updated',
//   STATE_CHECKPOINT_CREATED = 'state_checkpoint_created',
//   STATE_CHECKPOINT_LOADED = 'state_checkpoint_loaded',
//   SHUTDOWN_INITIATED = 'shutdown_initiated',
//   RECOVERY_COMPLETED = 'recovery_completed',
//   RECOVERY_FAILED = 'recovery_failed',
//   REQUEST_MALFORMED = 'request_malformed',
//   RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
//   RESPONSE_SENT = 'response_sent',
//   CONFIGURATION_CHANGED = 'configuration_changed'
// }

export enum EventType {
  // Request lifecycle events
  REQUEST_RECEIVED = 'REQUEST_RECEIVED',
  REQUEST_VALIDATED = 'REQUEST_VALIDATED',
  REQUEST_ACCEPTED = 'REQUEST_ACCEPTED',
  REQUEST_FORWARDED = 'REQUEST_FORWARDED',
  RESPONSE_RECEIVED = 'RESPONSE_RECEIVED',
  RETRY_SCHEDULED = 'RETRY_SCHEDULED',
  REQUEST_COMPLETED = 'REQUEST_COMPLETED',
  REQUEST_FAILED = 'REQUEST_FAILED',
  // Throttling and cooldown events
  COOLDOWN_ACTIVATED = 'COOLDOWN_ACTIVATED',
  COOLDOWN_EXPIRED = 'COOLDOWN_EXPIRED',
  RATE_LIMITED = 'RATE_LIMITED',
  CAPACITY_UPDATED = 'CAPACITY_UPDATED',
  // Circuit breaker events
  CIRCUIT_OPENED = 'CIRCUIT_OPENED',
  CIRCUIT_CLOSED = 'CIRCUIT_CLOSED',
  // Future events
  DEADLETTER_ADDED = 'DEADLETTER_ADDED',
  SHUTDOWN_INITIATED = 'SHUTDOWN_INITIATED',
  REQUEST_MALFORMED = 'REQUEST_MALFORMED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  REQUEST_DELAYED = 'REQUEST_DELAYED',
  RESPONSE_SENT = 'RESPONSE_SENT',
  CONFIGURATION_CHANGED = 'CONFIGURATION_CHANGED'

}

// import { MetricsEventType } from '../metrics/collection/MetricsEventListener';
// export { MetricsEventType } from '../metrics/collection/MetricsEventListener';

/**
 * Event interface
 */
export interface Event {
  type: EventType;
  requestId?: string;
  groupKey?: string;
  orgId?: string;
  timestamp: Date;
  payload?: Record<string, any>;
}

/**
 * Event handler function type
 */
export type EventHandler = (event: Event) => void;

/**
 * Event bus for system-wide events
 * Acts as a central messaging system for decoupled components
 */
export class EventBus {
  private subscribers: Map<EventType, Set<EventHandler>> = new Map();

  constructor() {
    console.log('Event bus initialized');
  }

  /**
   * Publish an event to all subscribers
   * @param {Event} event - Event object with type, payload, and metadata
   */
  publish(event: Event): void {
    // console.log(event,'Event in publish toh yh update kyu nhi kar raha')
    if (!event || !event.type) {
      console.error('Invalid event published:', event);
      return;
    }

    // // Add this line for debugging
    // console.log(`EventBus: Publishing event ${event.type} for request ${event.requestId || 'unknown'}`);

    const handlers = this.subscribers.get(event.type) || new Set();
    // console.log(handlers,'eventype in subscriber')
    let handlerCount = 0;

    // Add timestamp if not provided
    if (!event.timestamp) {
      event.timestamp = new Date();
    }

  //  console.log('EventBus: Publishing event', event, handlers);

  for (const handler of handlers) {
    // console.log("handler", handler(event)) // <--- GOOD: YOU COMMENTED THIS OUT
    try {
      console.log(`Attempting to call handler for event type: ${event.type}`); // New Debug: Before handler call
      handler(event); // This is the crucial line that needs to succeed
      console.log('Handler executed successfully!'); // New Debug: After successful handler call
      handlerCount++; // This is where it should increment
      console.log(`handlerCount after increment: ${handlerCount}`); // New Debug: Check count
    } catch (error) {
      // THIS IS THE MOST LIKELY PLACE THE PROBLEM IS OCCURRING IF handlerCount ISN'T INCREMENTING
      console.error(`Error in event handler for ${event.type}:`, error);
      // Important: When an error occurs here, handlerCount++ is SKIPPED for this handler.
    }
  }

    // if (handlerCount > 0) {
    //   console.debug(`Publdished ${event.type} event to ${handlerCount} handlers`);
    // }
  }

  /**
   * Subscribe to an event type
   * @param {EventType} eventType - Event type to subscribe to
   * @param {EventHandler} handler - Handler function for the event
   * @returns {Function} Unsubscribe function
   */
  subscribe(eventType: EventType, handler: EventHandler): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    
    this.subscribers.get(eventType)!.add(handler);
    console.debug(`Subscribed to ${eventType} events`);
    
    // Return unsubscribe function
    return () => {
      this.unsubscribe(eventType, handler);
    };
  }

  /**
   * Unsubscribe from an event type
   * @param {EventType} eventType - Event type to unsubscribe from
   * @param {EventHandler} handler - Handler function to remove
   */
  unsubscribe(eventType: EventType, handler: EventHandler): void {
    const handlers = this.subscribers.get(eventType);
    
    if (handlers) {
      handlers.delete(handler);
      console.debug(`Unsubscribed from ${eventType} events`);
      
      if (handlers.size === 0) {
        this.subscribers.delete(eventType);
      }
    }
  }

  /**
   * Get the number of subscribers for an event type
   * @param {EventType} eventType - Event type to check
   * @returns {number} Number of subscribers
   */
  getSubscriberCount(eventType: EventType): number {
    return this.subscribers.get(eventType)?.size || 0;
  }
}

// Export singleton instance
export const eventBus = new EventBus(); 

// /**
//  * Event types enumeration for system events
//  */
// export enum EventType {
//     // Request lifecycle events
//     REQUEST_RECEIVED = 'request_received',
//     REQUEST_VALIDATED = 'request_validated',
//     REQUEST_ACCEPTED = 'request_accepted',
//     REQUEST_FORWARDED = 'request_forwarded',
//     REQUEST_DELAYED = 'request_delayed',
//     RESPONSE_RECEIVED = 'response_received',
//     RETRY_SCHEDULED = 'retry_scheduled',
//     COOLDOWN_ACTIVATED = 'cooldown_activated',
//     COOLDOWN_EXPIRED = 'cooldown_expired',
//     RATE_LIMITED = 'rate_limited',
//     REQUEST_COMPLETED = 'request_completed',
//     REQUEST_FAILED = 'request_failed',
//     DEADLETTER_ADDED = 'deadletter_added',
//     CAPACITY_UPDATED = 'capacity_updated',
//     STATE_CHECKPOINT_CREATED = 'state_checkpoint_created',
//     STATE_CHECKPOINT_LOADED = 'state_checkpoint_loaded',
//     SHUTDOWN_INITIATED = 'shutdown_initiated',
//     RECOVERY_COMPLETED = 'recovery_completed',
//     RECOVERY_FAILED = 'recovery_failed',
//     // New events
//     CONFIGURATION_CHANGED = 'configuration_changed',
//     REQUEST_TIMED_OUT = 'request_timed_out',
//     REQUEST_PAYLOAD_TOO_LARGE = 'request_payload_too_large',
//     REQUEST_MALFORMED = 'request_malformed',
//     UPSTREAM_UNAVAILABLE = 'upstream_unavailable',
//     UPSTREAM_ERROR = 'upstream_error',
//     RETRY_ATTEMPTED = 'retry_attempted',
//     RETRY_EXHAUSTED = 'retry_exhausted',
//     REQUEST_CANCELLED_BY_CLIENT = 'request_cancelled_by_client',
//     RESPONSE_SENT = 'response_sent',
//     RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
// }

// /**
//  * Event interface
//  */
// export interface Event {
//   type: EventType;
//   requestId?: string;
//   groupKey?: string;
//   orgId?: string;
//   timestamp: Date;
//   payload?: Record<string, any>;
// }

// /**
//  * Event handler function type
//  */
// export type EventHandler = (event: Event) => void;

// /**
//  * Event bus for system-wide events
//  * Acts as a central messaging system for decoupled components
//  */
// export class EventBus {
//   private subscribers: Map<EventType, Set<EventHandler>> = new Map();

//   constructor() {
//     console.log('Event bus initialized');
//   }

//   /**
//    * Publish an event to all subscribers
//    * @param {Event} event - Event object with type, payload, and metadata
//    */
//   publish(event: Event): void {
//     if (!event || !event.type) {
//       console.error('Invalid event published:', event);
//       return;
//     }

//     // // Add this line for debugging
//     // console.log(`EventBus: Publishing event ${event.type} for request ${event.requestId || 'unknown'}`);

//     const handlers = this.subscribers.get(event.type) || new Set();
//     let handlerCount = 0;

//     // Add timestamp if not provided
//     if (!event.timestamp) {
//       event.timestamp = new Date();
//     }

//     for (const handler of handlers) {
//       try {
//         handler(event);
//         handlerCount++;
//       } catch (error) {
//         console.error(`Error in event handler for ${event.type}:`, error);
//       }
//     }

//     // if (handlerCount > 0) {
//     //   console.debug(`Published ${event.type} event to ${handlerCount} handlers`);
//     // }
//   }

//   /**
//    * Subscribe to an event type
//    * @param {EventType} eventType - Event type to subscribe to
//    * @param {EventHandler} handler - Handler function for the event
//    * @returns {Function} Unsubscribe function
//    */
//   subscribe(eventType: EventType, handler: EventHandler): () => void {
//     if (!this.subscribers.has(eventType)) {
//       this.subscribers.set(eventType, new Set());
//     }
    
//     this.subscribers.get(eventType)!.add(handler);
//     console.debug(`Subscribed to ${eventType} events`);
    
//     // Return unsubscribe function
//     return () => {
//       this.unsubscribe(eventType, handler);
//     };
//   }

//   /**
//    * Unsubscribe from an event type
//    * @param {EventType} eventType - Event type to unsubscribe from
//    * @param {EventHandler} handler - Handler function to remove
//    */
//   unsubscribe(eventType: EventType, handler: EventHandler): void {
//     const handlers = this.subscribers.get(eventType);
    
//     if (handlers) {
//       handlers.delete(handler);
//       console.debug(`Unsubscribed from ${eventType} events`);
      
//       if (handlers.size === 0) {
//         this.subscribers.delete(eventType);
//       }
//     }
//   }

//   /**
//    * Get the number of subscribers for an event type
//    * @param {EventType} eventType - Event type to check
//    * @returns {number} Number of subscribers
//    */
//   getSubscriberCount(eventType: EventType): number {
//     return this.subscribers.get(eventType)?.size || 0;
//   }
// }

// // Export singleton instance
// export const eventBus = new EventBus(); 