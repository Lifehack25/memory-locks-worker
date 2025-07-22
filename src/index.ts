import { Hono } from 'hono';
import { cors } from 'hono/cors';
import Hashids from 'hashids';

// Type definitions for Cloudflare environment
interface Env {
  DB: D1Database;
  ADMIN_API_KEY: string;
  CLOUDFLARE_ACCOUNT_HASH: string;
}

// Authentication models for custom auth system
interface User {
  id: number;
  email?: string;
  phone_number?: string;
  auth_provider: 'email' | 'phone' | 'google' | 'apple';
  provider_id?: string;
  name?: string;
  profile_picture_url?: string;
  email_verified: boolean;
  phone_verified: boolean;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
}

interface RefreshToken {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  created_at: string;
  last_used_at?: string;
  device_info?: string;
  is_revoked: boolean;
}


// JWT token payload interface
interface JWTPayload {
  sub: string; // user_id
  email?: string;
  name?: string;
  iat: number;
  exp: number;
  iss: string;
}

// Authentication request/response interfaces
interface AuthRequest {
  identifier: string; // email or phone
  type: 'email' | 'phone';
}

interface VerifyCodeRequest {
  identifier: string;
  code: string;
  type: 'email' | 'phone';
}

interface SocialAuthRequest {
  provider: 'google' | 'apple';
  token: string; // ID token from provider
}

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: number;
    email?: string;
    name?: string;
    profile_picture_url?: string;
  };
}

// Data models matching production Entity Framework models (PascalCase)
interface Lock {
  Id: number;
  LockName?: string;
  AlbumTitle?: string;
  SealDate?: string;
  NotifiedWhenScanned: boolean;
  ScanCount: number;
  CreatedAt: string;
  user_id?: number;
}

interface MediaObject {
  Id: number;
  LockId: number;
  CloudflareImageId: string;
  Url: string;
  FileName?: string;
  MediaType: string;
  IsProfilePicture: boolean;
  CreatedAt: string;
}

interface AlbumResponse {
  lockName: string;
  albumTitle: string;
  sealDate?: string;
  media: EnhancedMediaObject[];
}

interface EnhancedMediaObject extends MediaObject {
  urls?: {
    thumbnail?: string;
    profile?: string;
  };
}

interface LockWithMedia extends Lock {
  media: MediaObject[];
}

const app = new Hono<{ Bindings: Env }>();

// Input validation functions
function validateHashId(hashId: string): boolean {
  // HashId should be alphanumeric, 6+ characters (based on Hashids config)
  return /^[a-zA-Z0-9]{6,20}$/.test(hashId);
}

function validateLockId(lockId: unknown): boolean {
  const id = Number(lockId);
  return Number.isInteger(id) && id > 0 && id <= 2147483647; // Max 32-bit int
}

function validateCount(count: unknown): boolean {
  const num = Number(count);
  return Number.isInteger(num) && num > 0 && num <= 1000;
}

function validateUserId(userId: unknown): boolean {
  const id = Number(userId);
  return Number.isInteger(id) && id > 0 && id <= 2147483647;
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

function validatePhoneNumber(phone: string): boolean {
  // International phone number format starting with +
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
}

function validateVerificationCode(code: string): boolean {
  // 6-digit numeric code
  return /^\d{6}$/.test(code);
}

function validateStringInput(input: string, maxLength: number = 255): boolean {
  return typeof input === 'string' && input.length > 0 && input.length <= maxLength;
}

function sanitizeStringInput(input: string): string {
  // Remove potential harmful characters and trim
  return input.replace(/[<>'"&]/g, '').trim();
}

// User data helper functions
async function createUser(userData: Partial<User>, env: Env): Promise<User | null> {
  try {
    const insertResult = await env.DB.prepare(`
      INSERT INTO users (
        email, phone_number, auth_provider, provider_id, name, 
        profile_picture_url, email_verified, phone_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userData.email || null,
      userData.phone_number || null,
      userData.auth_provider || 'email',
      userData.provider_id || null,
      userData.name || null,
      userData.profile_picture_url || null,
      userData.email_verified ? 1 : 0,
      userData.phone_verified ? 1 : 0
    ).run();

    if (insertResult.success) {
      return {
        id: insertResult.meta.last_row_id as number,
        email: userData.email,
        phone_number: userData.phone_number,
        auth_provider: userData.auth_provider || 'email',
        provider_id: userData.provider_id,
        name: userData.name,
        profile_picture_url: userData.profile_picture_url,
        email_verified: userData.email_verified || false,
        phone_verified: userData.phone_verified || false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }
    return null;
  } catch (error) {
    console.error('Error creating user:', error);
    return null;
  }
}

async function getUserByIdentifier(identifier: string, env: Env): Promise<User | null> {
  try {
    const user = await env.DB.prepare(`
      SELECT * FROM users WHERE email = ? OR phone_number = ? LIMIT 1
    `).bind(identifier, identifier).first() as User | null;
    
    return user;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
}

async function getUserById(userId: number, env: Env): Promise<User | null> {
  try {
    const user = await env.DB.prepare(`
      SELECT * FROM users WHERE id = ? LIMIT 1
    `).bind(userId).first() as User | null;
    
    return user;
  } catch (error) {
    console.error('Error getting user by ID:', error);
    return null;
  }
}

// CORS middleware
app.use('/api/*', cors({
  origin: ['https://album.memorylocks.com', 'https://api.memorylocks.com'],
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// Helper function to decode hashids
function decodeHashId(hashId: string): number | null {
  const hashidsInstance = new Hashids('GzFbxMxQkArX1cLMo3tnGmpNxL5lUOROXXum5xfhiPU=', 6);
  const decoded = hashidsInstance.decode(hashId);
  return decoded.length > 0 ? decoded[0] as number : null;
}


// Enhanced bot detection function
function isBot(userAgent: string, referer: string | null, headers?: Record<string, string>): boolean {
  // Allow MAUI app access - check for .NET HttpClient user agent patterns
  if (userAgent && (/\.NET/i.test(userAgent) || /HttpClient/i.test(userAgent) || /MAUI/i.test(userAgent))) {
    return false;
  }
  
  // Allow legitimate mobile apps
  if (userAgent && (/Mobile/i.test(userAgent) && (/iOS/i.test(userAgent) || /Android/i.test(userAgent)))) {
    // Additional check to ensure it's not a fake mobile user agent
    if (!/bot|crawler|spider|scraper/i.test(userAgent)) {
      return false;
    }
  }
  
  // Comprehensive bot patterns
  const botPatterns = [
    // AI/ML services
    /openai/i, /gpt/i, /google-extended/i, /ccbot/i, /claude-web/i, /anthropic/i, /bard/i, /chatgpt/i,
    // Generic bots
    /bot/i, /crawler/i, /spider/i, /scraper/i, /fetch/i, /monitor/i,
    // Specific crawlers
    /googlebot/i, /bingbot/i, /slurp/i, /facebookexternalhit/i, /twitterbot/i, /linkedinbot/i,
    /whatsapp/i, /telegrambot/i, /applebot/i, /baiduspider/i, /yandexbot/i,
    // Security scanners
    /nmap/i, /masscan/i, /zmap/i, /nuclei/i, /sqlmap/i, /nikto/i, /nessus/i,
    // HTTP libraries (but not .NET HttpClient which MAUI uses)
    /python-requests/i, /python-urllib/i, /go-http-client/i, /apache-httpclient/i,
    /libwww-perl/i, /php/i, /ruby/i, /nodejs/i, /axios/i,
    // Command line tools
    /wget/i, /curl/i, /httpie/i, /postman/i, /insomnia/i,
    // Headless browsers (often used for scraping)
    /headlesschrome/i, /phantomjs/i, /slimerjs/i, /selenium/i, /playwright/i, /puppeteer/i,
    // Suspicious patterns
    /^Mozilla\/5\.0$/, // Too generic
    /test/i, /scan/i, /probe/i, /check/i
  ];
  
  // Check for empty or suspiciously short user agent
  if (!userAgent || userAgent.length < 10) {
    return true;
  }
  
  // Check user agent for bot patterns
  if (botPatterns.some(pattern => pattern.test(userAgent))) {
    return true;
  }
  
  // More relaxed referer check - allow requests without referer for mobile apps
  if (referer && referer !== '' && !referer.includes('album.memorylocks.com') && !referer.includes('localhost')) {
    // If there's a referer but it's not from our domains, it might be suspicious
    // But allow empty/null referer for mobile apps
    return true;
  }
  
  // Additional header-based detection if headers are provided
  if (headers) {
    // Check for automation headers
    const automationHeaders = [
      'x-requested-with', 'x-automation', 'x-test', 'x-robot',
      'accept-language', 'sec-fetch-site', 'sec-fetch-mode'
    ];
    
    // Bots often lack common browser headers
    const hasAcceptLanguage = headers['accept-language'];
    const hasSecFetchSite = headers['sec-fetch-site'];
    
    // Real browsers typically have accept-language and sec-fetch headers
    if (!hasAcceptLanguage && !hasSecFetchSite) {
      return true;
    }
  }
  
  return false;
}

// Rate limiting storage (in-memory for simplicity)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function isRateLimited(ip: string, maxRequests: number = 10, windowMinutes: number = 1): boolean {
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;
  
  const current = rateLimitMap.get(ip);
  
  if (!current || now > current.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return false;
  }
  
  if (current.count >= maxRequests) {
    return true;
  }
  
  current.count++;
  return false;
}

// API key validation for administrative endpoints
function validateApiKey(providedKey: string | undefined, expectedKey: string): boolean {
  return providedKey === expectedKey && providedKey !== undefined && providedKey !== '';
}

// USER DATA ENDPOINTS (for ASP.NET Core API to use)


// POST /api/data/users - Create a new user
app.post('/api/data/users', async (c) => {
  try {
    const apiKey = c.req.header('X-API-Key');
    if (!validateApiKey(apiKey, c.env.ADMIN_API_KEY)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userData = await c.req.json() as Partial<User>;
    const user = await createUser(userData, c.env);
    
    if (user) {
      return c.json(user);
    } else {
      return c.json({ error: 'Failed to create user' }, 500);
    }
  } catch (error) {
    console.error('Create user error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /api/data/users/by-identifier/:identifier - Get user by email or phone
app.get('/api/data/users/by-identifier/:identifier', async (c) => {
  try {
    const apiKey = c.req.header('X-API-Key');
    if (!validateApiKey(apiKey, c.env.ADMIN_API_KEY)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const identifier = c.req.param('identifier');
    const user = await getUserByIdentifier(identifier, c.env);
    
    if (user) {
      return c.json(user);
    } else {
      return c.json({ error: 'User not found' }, 404);
    }
  } catch (error) {
    console.error('Get user error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /api/data/users/:id - Get user by ID
app.get('/api/data/users/:id', async (c) => {
  try {
    const apiKey = c.req.header('X-API-Key');
    if (!validateApiKey(apiKey, c.env.ADMIN_API_KEY)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userId = parseInt(c.req.param('id'));
    if (!validateUserId(userId)) {
      return c.json({ error: 'Invalid user ID' }, 400);
    }

    const user = await getUserById(userId, c.env);
    
    if (user) {
      return c.json(user);
    } else {
      return c.json({ error: 'User not found' }, 404);
    }
  } catch (error) {
    console.error('Get user by ID error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /api/data/users/:id/login - Update user last login timestamp
app.put('/api/data/users/:id/login', async (c) => {
  try {
    const apiKey = c.req.header('X-API-Key');
    if (!validateApiKey(apiKey, c.env.ADMIN_API_KEY)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userId = parseInt(c.req.param('id'));
    if (!validateUserId(userId)) {
      return c.json({ error: 'Invalid user ID' }, 400);
    }

    await c.env.DB.prepare(`
      UPDATE users SET last_login_at = datetime('now') WHERE id = ?
    `).bind(userId).run();

    return c.json({ message: 'Login timestamp updated' });
  } catch (error) {
    console.error('Update login timestamp error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// DELETE /api/data/users/provider/:provider/:providerId - Delete user by provider ID
app.delete('/api/data/users/provider/:provider/:providerId', async (c) => {
  try {
    const apiKey = c.req.header('X-API-Key');
    if (!validateApiKey(apiKey, c.env.ADMIN_API_KEY)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const provider = c.req.param('provider');
    const providerId = c.req.param('providerId');

    if (!provider || !providerId) {
      return c.json({ error: 'Missing provider or provider ID' }, 400);
    }

    // Find the user first
    const user = await c.env.DB.prepare(`
      SELECT id FROM users WHERE auth_provider = ? AND provider_id = ?
    `).bind(provider, providerId).first() as { id: number } | null;

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Get all locks owned by this user for logging
    const userLocks = await c.env.DB.prepare(`
      SELECT Id, LockName, AlbumTitle FROM Locks WHERE user_id = ?
    `).bind(user.id).all();

    console.log(`User ${user.id} has ${userLocks.results?.length || 0} locks that will be cleared`);

    // Note: refresh tokens are now JWT-based (no database storage needed)
    // Old refresh token cleanup removed

    // Clear locks - set user_id to NULL so locks become unclaimed
    // This preserves the locks and their media for public viewing
    // but removes the association with the deleted user
    await c.env.DB.prepare(`
      UPDATE Locks 
      SET user_id = NULL
      WHERE user_id = ?
    `).bind(user.id).run();

    // Delete the user
    await c.env.DB.prepare(`
      DELETE FROM users WHERE id = ?
    `).bind(user.id).run();

    // Log the cleanup for audit purposes
    if (userLocks.results && userLocks.results.length > 0) {
      console.log(`Cleared ${userLocks.results.length} locks for deleted user ${user.id}:`, 
        userLocks.results.map((lock: any) => `${lock.Id}:${lock.LockName || 'unnamed'}`).join(', '));
    }

    return c.json({ 
      message: 'User and associated data deleted successfully',
      details: {
        userId: user.id,
        locksCleared: userLocks.results?.length || 0,
        note: 'Locks remain publicly accessible but are no longer associated with the user'
      }
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ADMINISTRATIVE ENDPOINTS

// POST /api/locks/generate/{count} - Create multiple locks (requires API key)
app.post('/api/locks/generate/:count', async (c) => {
  try {
    const countParam = c.req.param('count');
    const apiKey = c.req.header('X-API-Key');
    
    // Input validation
    if (!countParam || !validateCount(countParam)) {
      return c.json({ error: 'Invalid count parameter. Must be between 1 and 1000.' }, 400);
    }
    
    const count = parseInt(countParam);
    
    // Validate API key
    if (!validateApiKey(apiKey, c.env.ADMIN_API_KEY)) {
      return c.json({ error: 'Unauthorized: Invalid API key' }, 401);
    }
    
    const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const createdLocks: number[] = [];
    
    // Insert locks in batch
    const stmt = c.env.DB.prepare(`
      INSERT INTO Locks (LockName, AlbumTitle, NotifiedWhenScanned, ScanCount, CreatedAt) 
      VALUES (?, ?, ?, ?, ?)
    `);
    
    for (let i = 0; i < count; i++) {
      const result = await stmt
        .bind(null, null, false, 0, currentDate)
        .run();
      
      if (result.meta?.last_row_id) {
        createdLocks.push(result.meta.last_row_id as number);
      }
    }
    
    return c.json({ 
      success: true, 
      created: createdLocks.length,
      lockIds: createdLocks,
      message: `Successfully created ${createdLocks.length} locks`
    });
    
  } catch (error) {
    console.error('Error creating locks:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// WEB ALBUM ENDPOINT
// GET /api/album/{hashId} - Returns album title, seal date, and all media objects for that lock
app.get('/api/album/:hashId', async (c) => {
  try {
    const hashId = c.req.param('hashId');
    
    // Input validation
    if (!hashId || !validateHashId(hashId)) {
      return c.json({ error: 'Invalid hash ID format' }, 400);
    }
    
    const userAgent = c.req.header('User-Agent') || '';
    const referer = c.req.header('Referer');
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    
    // Collect headers for enhanced bot detection
    const headers: Record<string, string> = {
      'accept-language': c.req.header('Accept-Language') || '',
      'sec-fetch-site': c.req.header('Sec-Fetch-Site') || '',
      'sec-fetch-mode': c.req.header('Sec-Fetch-Mode') || '',
      'x-requested-with': c.req.header('X-Requested-With') || ''
    };
    
    // Enhanced bot detection
    if (isBot(userAgent, referer || null, headers)) {
      console.log(`Bot detected: ${userAgent}, Referer: ${referer}, IP: ${clientIP}`);
      return c.json({ error: 'Access denied' }, 403);
    }
    
    // Rate limiting
    if (isRateLimited(clientIP)) {
      console.log(`Rate limited: ${clientIP}`);
      return c.json({ error: 'Too many requests' }, 429);
    }
    
    const lockId = decodeHashId(hashId);
    
    if (!lockId || !validateLockId(lockId)) {
      return c.json({ error: 'Invalid lock ID' }, 400);
    }

    console.log(`Album request: hashId=${hashId}, decoded lockId=${lockId}`);

    // Get lock details
    const lockResult = await c.env.DB.prepare('SELECT * FROM Locks WHERE Id = ?')
      .bind(lockId)
      .first<Lock>();

    if (!lockResult) {
      return c.json({ error: 'Lock not found' }, 404);
    }

    // Get media objects for this lock
    const mediaResults = await c.env.DB.prepare('SELECT * FROM MediaObjects WHERE LockId = ? ORDER BY CreatedAt')
      .bind(lockId)
      .all();

    console.log(`Media query for lock ${lockId}: found ${mediaResults.results?.length || 0} results`);

    const mediaWithVariantUrls = (mediaResults.results || []).map((media: any) => {
      // Extract Cloudflare Image ID from the URL
      const imageId = media.CloudflareImageId;
      const accountHash = c.env.CLOUDFLARE_ACCOUNT_HASH;
      
      return {
        // Keep original PascalCase fields for consistency
        ...media,
        urls: {
          thumbnail: `https://media.memorylocks.com/${imageId}/w=300,h=300,fit=cover`,
          profile: `https://media.memorylocks.com/${imageId}/w=750,h=auto,fit=scale-down`
        }
      };
    });

    const response: AlbumResponse = {
      lockName: lockResult.LockName || 'Memory Lock',
      albumTitle: lockResult.AlbumTitle || 'Wonderful Memories',
      sealDate: lockResult.SealDate || undefined,
      media: mediaWithVariantUrls
    };

    return c.json(response);
  } catch (error) {
    console.error('Error fetching album:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// MOBILE APP ENDPOINTS

// GET /api/locks/user/{userId} - Get all locks for user
app.get('/api/locks/user/:userId', async (c) => {
  try {
    const userIdParam = c.req.param('userId');
    
    // Input validation
    if (!userIdParam || !validateUserId(userIdParam)) {
      return c.json({ error: 'Invalid user ID format' }, 400);
    }

    const userId = parseInt(userIdParam);

    // Get all locks for the user
    const locksResult = await c.env.DB.prepare('SELECT * FROM Locks WHERE user_id = ? ORDER BY CreatedAt DESC')
      .bind(userId)
      .all<Lock>();

    if (!locksResult.results || locksResult.results.length === 0) {
      return c.json([]);
    }

    // Get all media for all user locks in a single query (fixes N+1 problem)
    const lockIds = locksResult.results.map(lock => lock.Id);
    const placeholders = lockIds.map(() => '?').join(',');
    
    const mediaResult = await c.env.DB.prepare(
      `SELECT * FROM MediaObjects WHERE LockId IN (${placeholders}) ORDER BY LockId, CreatedAt`
    )
      .bind(...lockIds)
      .all<MediaObject>();

    // Group media by lock ID
    const mediaByLockId = new Map<number, MediaObject[]>();
    if (mediaResult.results) {
      for (const media of mediaResult.results) {
        const lockId = media.LockId;
        if (!mediaByLockId.has(lockId)) {
          mediaByLockId.set(lockId, []);
        }
        mediaByLockId.get(lockId)!.push(media);
      }
    }

    // Combine locks with their media
    const locksWithMedia: LockWithMedia[] = locksResult.results.map(lock => ({
      ...lock,
      media: mediaByLockId.get(lock.Id) || []
    }));

    return c.json(locksWithMedia);
  } catch (error) {
    console.error('Error fetching user locks:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /api/locks/{id}/notifications - Toggle NotifiedWhenScanned
app.patch('/api/locks/:id/notifications', async (c) => {
  try {
    const lockIdParam = c.req.param('id');
    
    // Input validation
    if (!lockIdParam || !validateLockId(lockIdParam)) {
      return c.json({ error: 'Invalid lock ID' }, 400);
    }
    
    const lockId = parseInt(lockIdParam);
    const body = await c.req.json();
    const { notifiedWhenScanned } = body;
    
    // Validate boolean parameter
    if (typeof notifiedWhenScanned !== 'boolean') {
      return c.json({ error: 'Invalid notifiedWhenScanned value. Must be boolean.' }, 400);
    }

    const result = await c.env.DB.prepare('UPDATE Locks SET NotifiedWhenScanned = ? WHERE Id = ?')
      .bind(notifiedWhenScanned, lockId)
      .run();

    if (result.changes === 0) {
      return c.json({ error: 'Lock not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating notifications:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /api/locks/{id}/seal - Seal lock (set SealDate to current datetime)
app.patch('/api/locks/:id/seal', async (c) => {
  try {
    const lockIdParam = c.req.param('id');
    
    // Input validation
    if (!lockIdParam || !validateLockId(lockIdParam)) {
      return c.json({ error: 'Invalid lock ID' }, 400);
    }
    
    const lockId = parseInt(lockIdParam);
    const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const result = await c.env.DB.prepare('UPDATE Locks SET SealDate = ? WHERE Id = ?')
      .bind(currentDate, lockId)
      .run();

    if (result.changes === 0) {
      return c.json({ error: 'Lock not found' }, 404);
    }

    return c.json({ success: true, sealDate: currentDate });
  } catch (error) {
    console.error('Error sealing lock:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /api/locks/{id}/unseal - Unseal lock (set SealDate to null)
app.patch('/api/locks/:id/unseal', async (c) => {
  try {
    const lockIdParam = c.req.param('id');
    
    // Input validation
    if (!lockIdParam || !validateLockId(lockIdParam)) {
      return c.json({ error: 'Invalid lock ID' }, 400);
    }
    
    const lockId = parseInt(lockIdParam);

    const result = await c.env.DB.prepare('UPDATE Locks SET SealDate = NULL WHERE Id = ?')
      .bind(lockId)
      .run();

    if (result.changes === 0) {
      return c.json({ error: 'Lock not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error unsealing lock:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /api/locks/{id}/name - Update LockName
app.patch('/api/locks/:id/name', async (c) => {
  try {
    const lockIdParam = c.req.param('id');
    
    // Input validation
    if (!lockIdParam || !validateLockId(lockIdParam)) {
      return c.json({ error: 'Invalid lock ID' }, 400);
    }
    
    const lockId = parseInt(lockIdParam);
    const body = await c.req.json();
    const { lockName } = body;
    
    // Validate lock name
    if (!lockName || !validateStringInput(lockName, 100)) {
      return c.json({ error: 'Invalid lock name. Must be 1-100 characters.' }, 400);
    }
    
    const sanitizedLockName = sanitizeStringInput(lockName);

    const result = await c.env.DB.prepare('UPDATE Locks SET LockName = ? WHERE Id = ?')
      .bind(sanitizedLockName, lockId)
      .run();

    if (result.changes === 0) {
      return c.json({ error: 'Lock not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating lock name:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /api/locks/{id}/album-title - Update AlbumTitle
app.patch('/api/locks/:id/album-title', async (c) => {
  try {
    const lockIdParam = c.req.param('id');
    
    // Input validation
    if (!lockIdParam || !validateLockId(lockIdParam)) {
      return c.json({ error: 'Invalid lock ID' }, 400);
    }
    
    const lockId = parseInt(lockIdParam);
    const body = await c.req.json();
    const { albumTitle } = body;
    
    // Validate album title
    if (!albumTitle || !validateStringInput(albumTitle, 150)) {
      return c.json({ error: 'Invalid album title. Must be 1-150 characters.' }, 400);
    }
    
    const sanitizedAlbumTitle = sanitizeStringInput(albumTitle);

    const result = await c.env.DB.prepare('UPDATE Locks SET AlbumTitle = ? WHERE Id = ?')
      .bind(sanitizedAlbumTitle, lockId)
      .run();

    if (result.changes === 0) {
      return c.json({ error: 'Lock not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating album title:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /api/locks/{id}/owner - Update lock owner (user_id)
app.patch('/api/locks/:id/owner', async (c) => {
  try {
    const lockIdParam = c.req.param('id');
    
    // Input validation
    if (!lockIdParam || !validateLockId(lockIdParam)) {
      return c.json({ error: 'Invalid lock ID' }, 400);
    }
    
    const lockId = parseInt(lockIdParam);
    const body = await c.req.json();
    const { userId } = body;
    
    // Validate user ID
    if (!userId || !validateUserId(userId)) {
      return c.json({ error: 'Invalid user ID format' }, 400);
    }

    const userIdInt = parseInt(userId);

    const result = await c.env.DB.prepare('UPDATE Locks SET user_id = ? WHERE Id = ?')
      .bind(userIdInt, lockId)
      .run();

    if (result.changes === 0) {
      return c.json({ error: 'Lock not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating lock owner:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    env: {
      hasAdminKey: !!c.env.ADMIN_API_KEY
    }
  });
});


// Root endpoint
app.get('/', (c) => {
  return c.json({ 
    message: 'Memory Locks Worker API',
    version: '1.0.0',
    endpoints: {
      generateLocks: 'POST /api/locks/generate/{count} (requires X-API-Key header)',
      album: 'GET /api/album/{hashId}',
      userLocks: 'GET /api/locks/user/{userId}',
      toggleNotifications: 'PATCH /api/locks/{id}/notifications',
      sealLock: 'PATCH /api/locks/{id}/seal',
      unsealLock: 'PATCH /api/locks/{id}/unseal',
      updateLockName: 'PATCH /api/locks/{id}/name',
      updateAlbumTitle: 'PATCH /api/locks/{id}/album-title',
      updateOwner: 'PATCH /api/locks/{id}/owner',
      userData: {
        createUser: 'POST /api/data/users (requires X-API-Key)',
        getUserById: 'GET /api/data/users/{id} (requires X-API-Key)',
        getUserByIdentifier: 'GET /api/data/users/by-identifier/{identifier} (requires X-API-Key)',
        updateLoginTime: 'PUT /api/data/users/{id}/login (requires X-API-Key)',
        deleteUserByProvider: 'DELETE /api/data/users/provider/{provider}/{providerId} (requires X-API-Key)'
      }
    }
  });
});

export default app;