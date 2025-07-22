import { Context } from 'hono';
import { Env } from '../types/common';

// Error types for better error handling
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.name = 'AppError';

    // Error.captureStackTrace(this, this.constructor); // Not available in all environments
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMITED');
    this.name = 'RateLimitError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR');
    this.name = 'DatabaseError';
  }
}

// Logger with different levels
export class Logger {
  private static createRequestId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private static formatLog(level: string, message: string, meta?: any, requestId?: string): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      requestId: requestId || 'no-request',
      ...meta
    };
    return JSON.stringify(logEntry);
  }

  static info(message: string, meta?: any, requestId?: string): void {
    console.log(this.formatLog('INFO', message, meta, requestId));
  }

  static warn(message: string, meta?: any, requestId?: string): void {
    console.warn(this.formatLog('WARN', message, meta, requestId));
  }

  static error(message: string, error?: Error | any, meta?: any, requestId?: string): void {
    const errorMeta = {
      ...meta,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error instanceof AppError ? { code: error.code, statusCode: error.statusCode } : {})
      } : undefined
    };
    console.error(this.formatLog('ERROR', message, errorMeta, requestId));
  }

  static debug(message: string, meta?: any, requestId?: string): void {
    console.log(this.formatLog('DEBUG', message, meta, requestId));
  }
}

// Global error handler middleware
export class ErrorHandler {
  static middleware() {
    return async (c: Context<{ Bindings: Env }>, next: () => Promise<void>) => {
      try {
        await next();
      } catch (error) {
        return this.handleError(error, c);
      }
    };
  }

  static handleError(error: any, c: any): any {
    const requestId = c.get('requestId') || Math.random().toString(36).substring(2, 15);
    
    // Log the error
    Logger.error('Request failed', error, {
      path: c.req?.path,
      method: c.req?.method,
      ip: c.req?.header('CF-Connecting-IP') || 'unknown',
      userAgent: c.req?.header('User-Agent') || 'unknown'
    }, requestId);

    // Handle different error types
    if (error instanceof AppError) {
      return c.json({
        error: error.message,
        success: false,
        code: error.code,
        requestId
      }, error.statusCode);
    }

    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      return c.json({
        error: 'Validation failed',
        success: false,
        code: 'VALIDATION_ERROR',
        details: error.errors,
        requestId
      }, 400);
    }

    // Handle database errors
    if (error.message?.includes('SQLITE') || error.message?.includes('D1')) {
      Logger.error('Database error detected', error, {}, requestId);
      return c.json({
        error: 'Database operation failed',
        success: false,
        code: 'DATABASE_ERROR',
        requestId
      }, 500);
    }

    // Generic error handling
    const isDevelopment = c.env?.ENVIRONMENT === 'development';
    
    return c.json({
      error: isDevelopment ? error.message : 'Internal server error',
      success: false,
      code: 'INTERNAL_ERROR',
      requestId,
      ...(isDevelopment && { stack: error.stack })
    }, 500);
  }

  // Utility function to create standardized success responses
  static success<T>(data?: T, message?: string): { success: true; data?: T; message?: string } {
    return {
      success: true,
      ...(data !== undefined && { data }),
      ...(message && { message })
    };
  }

  // Utility function to create standardized error responses
  static failure(message: string, code?: string, statusCode: number = 400): never {
    throw new AppError(message, statusCode, code || 'ERROR');
  }

  // Async wrapper for better error handling
  static asyncHandler<T extends any[], R>(
    fn: (...args: T) => Promise<R>
  ) {
    return async (...args: T): Promise<R> => {
      try {
        return await fn(...args);
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        
        Logger.error('Unexpected error in async handler', error);
        throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
      }
    };
  }

  // Request logging middleware
  static requestLogger() {
    return async (c: any, next: () => Promise<void>) => {
      const requestId = Math.random().toString(36).substring(2, 15);
      c.set('requestId', requestId);

      const startTime = Date.now();
      
      Logger.info('Request started', {
        method: c.req.method,
        path: c.req.path,
        ip: c.req.header('CF-Connecting-IP') || 'unknown',
        userAgent: c.req.header('User-Agent') || 'unknown'
      }, requestId);

      try {
        await next();
        
        const duration = Date.now() - startTime;
        Logger.info('Request completed', {
          method: c.req.method,
          path: c.req.path,
          status: c.res.status || 200,
          duration
        }, requestId);
      } catch (error) {
        const duration = Date.now() - startTime;
        Logger.error('Request failed', error, {
          method: c.req.method,
          path: c.req.path,
          duration
        }, requestId);
        throw error;
      }
    };
  }

  // Health check helper
  static healthCheck() {
    return (c: any) => {
      return c.json({
        success: true,
        message: 'Memory Locks Worker is healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        uptime: Date.now()
      });
    };
  }
}