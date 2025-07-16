/**
 * Types related to request tracking and management
 */

/**
 * Information about a tracked API request
 */
export interface RequestInfo {
  /** HTTP method used */
  method: string;
  /** Request URL */
  url: string;
  /** Request timestamp */
  timestamp: number;
  /** Query parameters */
  params?: Record<string, any>;
  /** Request headers */
  headers?: Record<string, string>;
  /** Response status code */
  status?: number;
  /** Request duration in ms */
  duration?: number;
}

/**
 * API request options type
 */
export interface APIRequestOptions {
  params?: Record<string, any>;
  headers?: Record<string, string>;
  data?: any;
  method?: string;
  [key: string]: any;
}
