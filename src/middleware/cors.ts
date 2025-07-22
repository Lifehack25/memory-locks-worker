import { cors } from 'hono/cors';

// CORS configuration for Memory Locks API
export const corsConfig = cors({
  origin: [
    'https://album.memorylocks.com',
    'https://api.memorylocks.com',
    // Add localhost for development
    'http://localhost:3000',
    'http://localhost:5173', // Vite dev server
    'http://127.0.0.1:3000',
  ],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-API-Key',
    'X-Requested-With',
  ],
  allowMethods: [
    'GET',
    'POST',
    'PATCH',
    'PUT',
    'DELETE',
    'OPTIONS',
  ],
  exposeHeaders: [
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
});

// Stricter CORS for admin endpoints
export const adminCorsConfig = cors({
  origin: [
    'https://api.memorylocks.com',
    // Only allow admin panel domains
    'http://localhost:3000', // Local admin development
  ],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-API-Key',
  ],
  allowMethods: [
    'GET',
    'POST',
    'PATCH',
    'PUT',
    'DELETE',
    'OPTIONS',
  ],
  credentials: true, // Allow credentials for admin operations
});

// Public CORS for album viewing (more permissive)
export const publicCorsConfig = cors({
  origin: [
    'https://album.memorylocks.com',
    // Allow direct access for QR code scanning from any source
    '*',
  ],
  allowHeaders: [
    'Content-Type',
  ],
  allowMethods: [
    'GET',
    'OPTIONS',
  ],
});

// Development CORS (very permissive for local development)
export const developmentCorsConfig = cors({
  origin: '*',
  allowHeaders: ['*'],
  allowMethods: ['*'],
});

// Function to get appropriate CORS config based on environment
export function getCorsConfig(isDevelopment: boolean = false) {
  if (isDevelopment) {
    return developmentCorsConfig;
  }
  return corsConfig;
}