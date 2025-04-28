# xlr8plus Architecture

## Overview

xlr8plus is an asynchronous offload proxy service designed to handle high-volume API requests. It accepts requests immediately, returns control to clients, and processes the actual HTTP requests asynchronously. This document outlines the architecture of the next-generation implementation.

## Architectural Principles

### 1. Resource Efficiency
- Optimized for high-throughput I/O operations
- Efficient memory usage with controlled object lifecycle
- Minimal CPU usage through asynchronous processing

### 2. Minimal External Dependencies
- Self-contained core functionality
- Optional Redis integration for multi-instance deployment
- No complex infrastructure requirements

### 3. Adaptive Behavior
- Dynamic capacity adjustment based on system load
- Self-tuning retry strategies based on observed patterns
- Automatic cooldown mechanisms for failing endpoints

### 4. Organization Customization
- Support for organization-specific rate limits
- Customizable retry strategies per organization
- Configurable thresholds and behaviors

### 5. Graceful Degradation
- Minimal request loss during restarts
- Proper shutdown sequence for Kubernetes environments
- State persistence and recovery mechanisms

## High-Level Architecture

```ascii
                      ┌─────────────────────────────────────────┐
                      │             Client Application          │
                      └───────────────────┬─────────────────────┘
                                          │ HTTP Requests
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                                  xlr8plus Service                               │
│                                                                             │
│  ┌─────────────────────────┐   ┌──────────────────────┐   ┌───────────────┐│
│  │                         │   │                      │   │               ││
│  │ Request Processing      │   │  State Management    │   │  Metrics &    ││
│  │ Pipeline                │◀──▶│                      │◀──▶│  Observability││
│  │                         │   │                      │   │               ││
│  └─────────────────────────┘   └──────────────────────┘   └───────────────┘│
│               │                                                  ▲          │
│               │                                                  │          │
│               ▼                                                  │          │
│  ┌─────────────────────────┐                          ┌─────────────────────┐
│  │                         │                          │                     │
│  │ Dead Letter Service     │                          │ Notification Service│
│  │                         │                          │                     │
│  └─────────────────────────┘                          └─────────────────────┘
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
                      ┌─────────────────────────────────────────┐
                      │           Downstream Services           │
                      └─────────────────────────────────────────┘
```

## Core System Components

### 1. Request Processing Pipeline

The Request Processing Pipeline is responsible for handling the flow of requests through the system:

```ascii
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ RequestAcceptor │────▶│ ThrottleManager │────▶│ ProxyExecutor   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│HeaderValidator  │     │ GroupManager    │     │RetryOrchestrator│
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │StatusClassifier │
                                                └─────────────────┘
```

- **RequestAcceptor**: Validates and processes incoming HTTP requests
- **ThrottleManager**: Enforces rate limits and manages system capacity
- **ProxyExecutor**: Forwards requests to target services
- **GroupManager**: Manages request grouping and cooldowns
- **RetryOrchestrator**: Handles retry logic for failed requests
- **StatusClassifier**: Categorizes HTTP responses for consistent handling

### 2. State Management

The State Management system handles persistence and recovery of system state:

```ascii
┌─────────────────┐     ┌─────────────────┐
│StateCoordinator │────▶│PeriodicCleanup  │
└─────────────────┘     └─────────────────┘
         │                       
         │                       
         ▼                       
┌─────────────────┐     ┌─────────────────┐
│RequestRepository│     │GroupRepository  │
└─────────────────┘     └─────────────────┘
         │                       │
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────────────────┐
│PersistenceLayer │     │RecoveryManager (not needed) │
└─────────────────┘     └─────────────────────────────┘
```

- **RequestRepository**: Manages request entities and their lifecycle
- **GroupRepository**: Handles request groups and their states
<!-- - **RecoveryManager**: Recovers in-flight requests after system restart (not needed now) -->
<!-- - **StateCoordinatorService**: Orchestrates state persistence and recovery (not needed now) -->
- **PersistenceLayer**: Handles serialization and storage of system state

### 3. Metrics & Observability

The Metrics & Observability system collects, processes, and reports system metrics:

```ascii
┌─────────────────┐     ┌─────────────────┐
│ EventBus        │────▶│MetricsAggregator│
└─────────────────┘     └─────────────────┘
         │                       │
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│EventSubscribers │     │TimeSeriesStorage│
└─────────────────┘     └─────────────────┘
         │                       │
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│ AlertMonitor    │────▶│NotificationSender│
└─────────────────┘     └─────────────────┘
```

- **EventBus**: Enables decoupled communication between components
- **MetricsAggregator**: Collects and processes system metrics
- **TimeSeriesStorage**: Stores time-based metrics data
- **AlertMonitor**: Monitors for anomalies and threshold violations
- **NotificationService**: Sends alerts to configured channels


<!-- ### 4. Dead Letter Service
Dead Letter Service is not current focus thats way commented

The Dead Letter Service handles requests that have failed after all retry attempts:

```ascii
┌─────────────────┐     ┌─────────────────┐
│DeadLetterHandler│────▶│DeadLetterStorage│
└─────────────────┘     └─────────────────┘
         │                       │
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│SensitiveDataFilter  │ │ ReplayService   │
└─────────────────┘     └─────────────────┘
```

- **DeadLetterHandler**: Processes requests that have exhausted retries
- **DeadLetterStorage**: Persists dead letter data securely
- **SensitiveDataFilter**: Redacts sensitive information before storage
- **ReplayService**: Allows manual or automated replay of dead letters -->

## Communication Patterns

### Event-Driven Architecture

xlr8plus uses an event-driven architecture to decouple components and enable asynchronous processing:

1. **Event Publication**: Components publish events to the EventBus
2. **Event Subscription**: Interested components subscribe to relevant events
3. **Event Processing**: Subscribers process events asynchronously

This pattern allows for:
- Loose coupling between components
- Scalable event processing
- Easy addition of new features through new event subscribers

### Repository Pattern

The state management system uses the repository pattern to abstract data access:

1. **Data Access Abstraction**: Repositories provide a clean API for data access
2. **In-Memory Implementation**: Default implementation uses in-memory storage
3. **Extensible Storage**: Design allows for future persistent storage implementations

## Deployment Considerations

### Kubernetes Integration

xlr8plus is designed for deployment in Kubernetes environments:

1. **Health Checks**: Readiness and liveness probe endpoints
2. **Graceful Shutdown**: Proper handling of SIGTERM signals
3. **Resource Awareness**: Dynamic adjustment based on available resources

### Scaling

The architecture supports horizontal and vertical scaling:

1. **Horizontal Scaling**: Multiple instances with optional Redis for coordination
2. **Vertical Scaling**: Efficient resource usage on larger machines
3. **Auto-scaling**: Compatible with Kubernetes HPA based on metrics

