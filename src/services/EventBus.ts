/**
 * Minimal EventBus for internal events
 */
export type EventType = 'SHUTDOWN_INITIATED' | 'RESPONSE_RECEIVED' | string;
export interface Event {
  type: EventType;
  timestamp: Date;
  payload?: any;
}
export type EventHandler = (event: Event) => void;

export class EventBus {
  private subscribers = new Map<EventType, Set<EventHandler>>();

  subscribe(eventType: EventType, handler: EventHandler): void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(handler);
  }

  unsubscribe(eventType: EventType, handler: EventHandler): void {
    this.subscribers.get(eventType)?.delete(handler);
  }

  publish(event: Event): void {
    this.subscribers.get(event.type)?.forEach(handler => handler(event));
  }
}

export const eventBus = new EventBus();
