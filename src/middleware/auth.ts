import { Context } from 'hono';
import { Env } from '../types/common';

// API Key validation middleware
export class AuthMiddleware {

  static validateApiKey(providedKey: string, expectedKey: string): boolean {
    if (!providedKey || !expectedKey) {
      return false;
    }

    return providedKey === expectedKey && providedKey.length > 0;
  }

  // Middleware factory for API key validation
  static requireApiKey() {
    return async (c: Context<{ Bindings: Env }>, next: () => Promise<void>) => {
      const apiKey = c.req.header('X-API-Key') || c.req.query('api_key');
      const expectedKey = c.env.ADMIN_API_KEY;

      if (!apiKey) {
        return c.json(
          {
            error: 'API key required',
            success: false
          },
          401
        );
      }

      if (!this.validateApiKey(apiKey, expectedKey)) {
        return c.json(
          {
            error: 'Invalid API key',
            success: false
          },
          403
        );
      }

      // API key is valid, proceed to next middleware/handler
      await next();
    };
  }

  // Alternative: Direct validation function for use in route handlers
  static checkApiKey(c: Context<{ Bindings: Env }>): { valid: boolean; error?: string } {
    const apiKey = c.req.header('X-API-Key') || c.req.query('api_key');
    const expectedKey = c.env.ADMIN_API_KEY;

    if (!apiKey) {
      return { valid: false, error: 'API key required' };
    }

    if (!this.validateApiKey(apiKey, expectedKey)) {
      return { valid: false, error: 'Invalid API key' };
    }

    return { valid: true };
  }

  // Extract client IP from request (considering Cloudflare headers)
  static getClientIP(c: Context): string {
    // Cloudflare provides the real client IP in these headers
    const cfConnectingIP = c.req.header('CF-Connecting-IP');
    const xForwardedFor = c.req.header('X-Forwarded-For');
    const xRealIP = c.req.header('X-Real-IP');

    // Prefer Cloudflare's CF-Connecting-IP as it's most reliable
    if (cfConnectingIP) {
      return cfConnectingIP;
    }

    // Fallback to X-Forwarded-For (take first IP)
    if (xForwardedFor) {
      const ips = xForwardedFor.split(',').map(ip => ip.trim());
      return ips[0];
    }

    // Final fallback
    return xRealIP || 'unknown';
  }

  // Get user agent with validation
  static getUserAgent(c: Context): string {
    return c.req.header('User-Agent') || '';
  }

  // Get referer with validation
  static getReferer(c: Context): string | null {
    const referer = c.req.header('Referer') || c.req.header('Referrer');
    return referer || null;
  }

  // Extract request headers for bot detection
  static getSecurityHeaders(c: Context): {
    'accept-language'?: string;
    'sec-fetch-site'?: string;
    'sec-fetch-mode'?: string;
    'sec-fetch-dest'?: string;
    'sec-ch-ua'?: string;
    'sec-ch-ua-mobile'?: string;
    'sec-ch-ua-platform'?: string;
    'cache-control'?: string;
    'pragma'?: string;
    'upgrade-insecure-requests'?: string;
  } {
    return {
      'accept-language': c.req.header('Accept-Language') || undefined,
      'sec-fetch-site': c.req.header('Sec-Fetch-Site') || undefined,
      'sec-fetch-mode': c.req.header('Sec-Fetch-Mode') || undefined,
      'sec-fetch-dest': c.req.header('Sec-Fetch-Dest') || undefined,
      'sec-ch-ua': c.req.header('Sec-CH-UA') || undefined,
      'sec-ch-ua-mobile': c.req.header('Sec-CH-UA-Mobile') || undefined,
      'sec-ch-ua-platform': c.req.header('Sec-CH-UA-Platform') || undefined,
      'cache-control': c.req.header('Cache-Control') || undefined,
      'pragma': c.req.header('Pragma') || undefined,
      'upgrade-insecure-requests': c.req.header('Upgrade-Insecure-Requests') || undefined,
    };
  }

  // Create request context for logging and debugging
  static createRequestContext(c: Context): {
    ip: string;
    userAgent: string;
    referer: string | null;
    method: string;
    path: string;
    timestamp: number;
  } {
    return {
      ip: this.getClientIP(c),
      userAgent: this.getUserAgent(c),
      referer: this.getReferer(c),
      method: c.req.method,
      path: c.req.path,
      timestamp: Date.now()
    };
  }
}
