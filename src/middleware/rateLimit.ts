// Rate limiting middleware for Cloudflare Workers
import { AppError } from './errorHandler';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// Rate limiting specific error
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMITED');
    this.name = 'RateLimitError';
  }
}

export class RateLimitService {
  private static readonly rateLimitMap = new Map<string, RateLimitEntry>();
  private static readonly DEFAULT_LIMIT = 10; // requests per minute
  private static readonly DEFAULT_WINDOW = 60 * 1000; // 1 minute in milliseconds

  // Clean up old entries periodically to prevent memory leaks
  private static readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private static lastCleanup = Date.now();

  static isRateLimited(
    identifier: string, 
    limit: number = this.DEFAULT_LIMIT, 
    windowMs: number = this.DEFAULT_WINDOW
  ): boolean {
    const now = Date.now();
    
    // Periodic cleanup
    this.performCleanup(now);

    const entry = this.rateLimitMap.get(identifier);
    
    if (!entry || now >= entry.resetTime) {
      // No entry or window expired - create new entry
      this.rateLimitMap.set(identifier, {
        count: 1,
        resetTime: now + windowMs
      });
      return false;
    }

    // Entry exists and window is still active
    if (entry.count >= limit) {
      return true; // Rate limited
    }

    // Increment counter
    entry.count++;
    this.rateLimitMap.set(identifier, entry);
    
    return false;
  }

  static getRemainingRequests(
    identifier: string, 
    limit: number = this.DEFAULT_LIMIT
  ): { remaining: number; resetTime: number } {
    const entry = this.rateLimitMap.get(identifier);
    
    if (!entry || Date.now() >= entry.resetTime) {
      return { remaining: limit, resetTime: 0 };
    }

    return {
      remaining: Math.max(0, limit - entry.count),
      resetTime: entry.resetTime
    };
  }

  static resetRateLimit(identifier: string): void {
    this.rateLimitMap.delete(identifier);
  }

  // Different rate limits for different endpoints
  static isAlbumRateLimited(clientIP: string): boolean {
    // More restrictive for album access to prevent abuse
    return this.isRateLimited(`album:${clientIP}`, 5, 60 * 1000); // 5 requests per minute
  }

  static isApiRateLimited(clientIP: string): boolean {
    // Standard rate limit for API endpoints
    return this.isRateLimited(`api:${clientIP}`, 20, 60 * 1000); // 20 requests per minute
  }

  static isAdminRateLimited(clientIP: string): boolean {
    // More lenient for authenticated admin operations
    return this.isRateLimited(`admin:${clientIP}`, 100, 60 * 1000); // 100 requests per minute
  }

  // User-specific rate limiting (for authenticated requests)
  static isUserRateLimited(userId: string, limit: number = 50): boolean {
    return this.isRateLimited(`user:${userId}`, limit, 60 * 1000);
  }

  // Burst protection - very short window with low limit
  static isBurstLimited(identifier: string): boolean {
    return this.isRateLimited(`burst:${identifier}`, 3, 10 * 1000); // 3 requests per 10 seconds
  }

  private static performCleanup(now: number): void {
    if (now - this.lastCleanup < this.CLEANUP_INTERVAL) {
      return; // Too soon for cleanup
    }

    this.lastCleanup = now;
    
    // Remove expired entries
    for (const [key, entry] of this.rateLimitMap.entries()) {
      if (now >= entry.resetTime) {
        this.rateLimitMap.delete(key);
      }
    }

    // Log cleanup statistics
    console.log(`Rate limit cleanup: ${this.rateLimitMap.size} active entries`);
  }

  // Get statistics for monitoring
  static getStats(): {
    activeEntries: number;
    memoryUsage: string;
    lastCleanup: number;
  } {
    const entries = this.rateLimitMap.size;
    const memoryUsage = `${Math.round(entries * 50)} bytes (estimated)`; // Rough estimate
    
    return {
      activeEntries: entries,
      memoryUsage,
      lastCleanup: this.lastCleanup
    };
  }

  // Manual cleanup for testing or administrative purposes
  static forceCleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.rateLimitMap.entries()) {
      if (now >= entry.resetTime) {
        this.rateLimitMap.delete(key);
        cleaned++;
      }
    }
    
    this.lastCleanup = now;
    return cleaned;
  }

  // Clear all rate limit data (use with caution)
  static clearAll(): void {
    this.rateLimitMap.clear();
    this.lastCleanup = Date.now();
  }
}