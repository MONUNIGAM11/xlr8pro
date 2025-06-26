/**
 * HTTP status categories for classification
 */
export enum StatusCategory {
  HTTP_SUCCESS = 'http_success',
  HTTP_AUTH_FAILURE = 'http_auth_failure',
  HTTP_RATE_LIMIT = 'http_rate_limit',
  HTTP_CLIENT_ERROR = 'http_client_error',
  HTTP_SERVER_ERROR = 'http_server_error',
  HTTP_GATEWAY_ERROR = 'http_gateway_error',
  HTTP_SERVICE_UNAVAILABLE = 'http_service_unavailable',
  HTTP_UNKNOWN = 'http_unknown'
}

/**
 * Service for classifying HTTP status codes
 */
export class StatusClassifier {
  /**
   * Classify an HTTP status code into a category
   * @param statusCode HTTP status code
   * @returns Status category
   */
  static classify(statusCode: number): StatusCategory {
    if (statusCode >= 200 && statusCode < 300) {
      return StatusCategory.HTTP_SUCCESS;
    } else if (statusCode === 401 || statusCode === 403) {
      return StatusCategory.HTTP_AUTH_FAILURE;
    } else if (statusCode === 429) {
      return StatusCategory.HTTP_RATE_LIMIT;
    } else if (statusCode >= 400 && statusCode < 500) {
      return StatusCategory.HTTP_CLIENT_ERROR;
    } else if (statusCode === 502 || statusCode === 504) {
      return StatusCategory.HTTP_GATEWAY_ERROR;
    } else if (statusCode === 503) {
      return StatusCategory.HTTP_SERVICE_UNAVAILABLE;
    } else if (statusCode >= 500 && statusCode < 600) {
      return StatusCategory.HTTP_SERVER_ERROR;
    } else {
      return StatusCategory.HTTP_UNKNOWN;
    }
  }

  /**
   * Check if a status code should be retried by default
   * @param statusCode HTTP status code
   * @returns Whether the status code should be retried
   */
  static isRetryable(statusCode: number): boolean {
    // Specifically handle network errors (status code 0)
    if (statusCode === 0) {
      // Network errors like TLS/SSL issues should be retryable
      return true;
    }
    
    const category = this.classify(statusCode);
    
    return [
      StatusCategory.HTTP_RATE_LIMIT,
      StatusCategory.HTTP_SERVER_ERROR,
      StatusCategory.HTTP_GATEWAY_ERROR,
      StatusCategory.HTTP_SERVICE_UNAVAILABLE
    ].includes(category);
  }
  
  /**
   * Get a descriptive name for a status code
   * @param statusCode HTTP status code
   * @returns Human-readable description
   */
  static getStatusName(statusCode: number): string {
    const statusNames: Record<number, string> = {
      200: 'OK',
      201: 'Created',
      202: 'Accepted',
      204: 'No Content',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable', 
      504: 'Gateway Timeout'
    };
    
    return statusNames[statusCode] || `Unknown Status (${statusCode})`;
  }
} 