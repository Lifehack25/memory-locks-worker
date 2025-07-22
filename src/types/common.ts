// Cloudflare Workers environment interface
export interface Env {
  DB: D1Database;
  ADMIN_API_KEY: string;
  CLOUDFLARE_ACCOUNT_HASH: string;
}

// Common response interfaces
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ErrorResponse {
  error: string;
  success: false;
}

export interface SuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
}

// Request context type  
export interface RequestContext {
  env: Env;
  requestId: string;
  userAgent?: string;
  clientIP?: string;
}