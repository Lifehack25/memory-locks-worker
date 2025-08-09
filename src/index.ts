import { Hono } from 'hono';
import { Env } from './types/common';
import { HashidsService } from './services/hashids';
import { UserService } from './services/database/users';
import { LocksService } from './services/database/locks';
import { BotProtectionService } from './middleware/botProtection';
import { RateLimitService, RateLimitError } from './middleware/rateLimit';
import { AuthMiddleware } from './middleware/auth';
import { corsConfig, publicCorsConfig, adminCorsConfig, getCorsConfig } from './middleware/cors';
import { ValidationMiddleware } from './middleware/validation';
import { ErrorHandler, Logger, NotFoundError, UnauthorizedError, DatabaseError, ValidationError } from './middleware/errorHandler';
import { CreateUserRequest } from './types/auth';

// Import validation schemas
import {
  CreateUserSchema,
  BulkLockGenerationSchema,
  UpdateLockSchema,
  UpdateLockNameSchema,
  UpdateAlbumTitleSchema,
  UpdateOwnerSchema,
  UpdateNotificationsSchema,
  AuthRequestSchema,
  VerifyCodeSchema,
  SocialAuthSchema,
  HashIdParamSchema,
  LockIdParamSchema,
  UserIdParamSchema,
  CountParamSchema,
  PaginationSchema,
  ProviderParamSchema,
  CreateMediaObjectSchema,
  MediaObjectIdParamSchema,
} from './validation/schemas';

// Initialize Hono app
const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', ErrorHandler.requestLogger());
app.use('*', ErrorHandler.middleware());

// Public routes (for album access)
app.use('/album/*', publicCorsConfig);

// Admin routes (stricter CORS)
app.use('/admin/*', adminCorsConfig);
app.use('/admin/*', AuthMiddleware.requireApiKey());

// API routes (standard CORS)
app.use('/api/*', corsConfig);

// Health check endpoint
app.get('/health', ErrorHandler.healthCheck());

// Root endpoint - API documentation
app.get('/', (c) => {
  return c.json({
    message: 'Memory Locks Worker API',
    version: '2.0.0',
    endpoints: {
      generateLocks: 'POST /api/locks/generate/{count} (requires X-API-Key header)',
      health: 'GET /health',
      album: 'GET /album/{hashId}',
      admin: {
        users: 'GET /admin/users',
        locks: 'GET /admin/locks',
        bulkGenerate: 'POST /admin/bulk-generate'
      },
      api: {
        userData: 'GET /api/data/users/{userId}',
        lockData: 'GET /api/data/locks/{lockId}',
        connectLock: 'PATCH /api/data/locks/{lockId}/connect'
      }
    },
    documentation: 'https://github.com/memorylocks/api-docs'
  });
});

// Album routes (public access)
app.get('/album/:hashId', 
  ValidationMiddleware.validateParams(HashIdParamSchema),
  async (c) => {
    const { hashId } = ValidationMiddleware.getValidatedParams<{ hashId: string }>(c);
    const clientIP = c.req.header('CF-Connecting-IP') || 'unknown';
    const userAgent = c.req.header('User-Agent') || 'unknown';
    const referer = c.req.header('Referer');

    // Bot protection
    const requestHeaders = {
      'accept-language': c.req.header('Accept-Language'),
      'sec-fetch-site': c.req.header('Sec-Fetch-Site'),
      'sec-fetch-mode': c.req.header('Sec-Fetch-Mode'),
      'sec-fetch-dest': c.req.header('Sec-Fetch-Dest'),
      'sec-ch-ua': c.req.header('Sec-Ch-Ua'),
      'sec-ch-ua-mobile': c.req.header('Sec-Ch-Ua-Mobile'),
      'sec-ch-ua-platform': c.req.header('Sec-Ch-Ua-Platform'),
      'cache-control': c.req.header('Cache-Control'),
      'pragma': c.req.header('Pragma'),
      'upgrade-insecure-requests': c.req.header('Upgrade-Insecure-Requests'),
    };

    // Temporarily disabled for debugging
    // if (BotProtectionService.isBot(userAgent, referer, requestHeaders)) {
    //   Logger.warn('Bot detected attempting album access', { 
    //     ip: clientIP, 
    //     userAgent, 
    //     hashId,
    //     headers: requestHeaders
    //   });
    //   throw new UnauthorizedError('Access denied');
    // }

    // Rate limiting for album access
    if (RateLimitService.isAlbumRateLimited(clientIP)) {
      throw new RateLimitError();
    }

    const hashidsService = new HashidsService();
    const lockId = hashidsService.decode(hashId);
    
    if (!lockId) {
      throw new NotFoundError('Album');
    }

    const locksService = new LocksService(c.env.DB);
    const albumData = await locksService.getAlbumData(lockId, c.env.CLOUDFLARE_ACCOUNT_HASH);
    
    if (!albumData) {
      throw new NotFoundError('Album');
    }

    // Increment scan count asynchronously
    locksService.incrementScanCount(lockId).catch(error => {
      Logger.error('Failed to increment scan count', error, { lockId });
    });

    Logger.info('Album accessed successfully', { 
      hashId, 
      lockId, 
      ip: clientIP 
    });

    return c.json(albumData);
  }
);

// Public API routes
app.post('/api/locks/generate/:count', 
  ValidationMiddleware.validateParams(CountParamSchema),
  async (c) => {
    // Check for API key
    const apiKey = c.req.header('X-API-Key');
    if (!apiKey) {
      return c.json({
        error: 'Unauthorized: Invalid API key',
        success: false
      }, 401);
    }

    // Validate API key
    if (!AuthMiddleware.validateApiKey(apiKey, c.env.ADMIN_API_KEY)) {
      return c.json({
        error: 'Unauthorized: Invalid API key',
        success: false
      }, 401);
    }

    const { count } = ValidationMiddleware.getValidatedParams<{ count: number }>(c);
    const locksService = new LocksService(c.env.DB);
    
    const result = await locksService.generateBulkLocks(count);
    
    Logger.info('Public locks generated', { 
      count: result.generated, 
      startId: result.startId, 
      endId: result.endId 
    });

    return c.json(result, 201);
  }
);

// User management routes (admin)
app.post('/admin/users', 
  ValidationMiddleware.validateBody(CreateUserSchema),
  async (c) => {
    const userData = ValidationMiddleware.getValidatedBody<CreateUserRequest>(c);
    const userService = new UserService(c.env.DB);
    
    const user = await userService.createUser(userData);
    if (!user) {
      throw new DatabaseError('Failed to create user');
    }

    Logger.info('User created successfully', { userId: user.id });
    return c.json(ErrorHandler.success(user, 'User created successfully'), 201);
  }
);

app.get('/admin/users/:userId',
  ValidationMiddleware.validateParams(UserIdParamSchema),
  async (c) => {
    const { userId } = ValidationMiddleware.getValidatedParams<{ userId: number }>(c);
    const userService = new UserService(c.env.DB);
    
    const user = await userService.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    return c.json(ErrorHandler.success(user));
  }
);

app.get('/admin/users',
  ValidationMiddleware.validateQuery(PaginationSchema),
  async (c) => {
    const { page, limit } = ValidationMiddleware.getValidatedQuery<{ page: number; limit: number }>(c);
    const userService = new UserService(c.env.DB);
    
    const users = await userService.getAllUsers(page, limit);
    return c.json(ErrorHandler.success(users));
  }
);

// Bulk lock generation (admin)
app.post('/admin/bulk-generate',
  ValidationMiddleware.validateBody(BulkLockGenerationSchema),
  async (c) => {
    const { count, prefix } = ValidationMiddleware.getValidatedBody<{ count: number; prefix?: string }>(c);
    const locksService = new LocksService(c.env.DB);
    
    const result = await locksService.generateBulkLocks(count, prefix);
    
    Logger.info('Bulk locks generated', { 
      count: result.generated, 
      startId: result.startId, 
      endId: result.endId 
    });

    return c.json(result, 201);
  }
);

// Lock management routes (admin)
app.get('/admin/locks/:lockId',
  ValidationMiddleware.validateParams(LockIdParamSchema),
  async (c) => {
    const { lockId } = ValidationMiddleware.getValidatedParams<{ lockId: number }>(c);
    const locksService = new LocksService(c.env.DB);
    
    const lock = await locksService.getLockById(lockId);
    if (!lock) {
      throw new NotFoundError('Lock');
    }

    return c.json(ErrorHandler.success(lock));
  }
);

app.patch('/admin/locks/:lockId',
  ValidationMiddleware.validate(UpdateLockSchema, LockIdParamSchema),
  async (c) => {
    const { lockId } = ValidationMiddleware.getValidatedParams<{ lockId: number }>(c);
    const updates = ValidationMiddleware.getValidatedBody(c);
    const locksService = new LocksService(c.env.DB);
    
    const success = await locksService.updateLock(lockId, updates);
    if (!success) {
      throw new NotFoundError('Lock');
    }

    Logger.info('Lock updated successfully', { lockId, updates });
    return c.json(ErrorHandler.success(null, 'Lock updated successfully'));
  }
);

app.patch('/admin/locks/:lockId/name',
  ValidationMiddleware.validate(UpdateLockNameSchema, LockIdParamSchema),
  async (c) => {
    const { lockId } = ValidationMiddleware.getValidatedParams<{ lockId: number }>(c);
    const { lockName } = ValidationMiddleware.getValidatedBody<{ lockName: string }>(c);
    const locksService = new LocksService(c.env.DB);
    
    const success = await locksService.updateLockName(lockId, lockName);
    if (!success) {
      throw new NotFoundError('Lock');
    }

    Logger.info('Lock name updated', { lockId, lockName });
    return c.json(ErrorHandler.success(null, 'Lock name updated successfully'));
  }
);

app.patch('/admin/locks/:lockId/album-title',
  ValidationMiddleware.validate(UpdateAlbumTitleSchema, LockIdParamSchema),
  async (c) => {
    const { lockId } = ValidationMiddleware.getValidatedParams<{ lockId: number }>(c);
    const { albumTitle } = ValidationMiddleware.getValidatedBody<{ albumTitle: string }>(c);
    const locksService = new LocksService(c.env.DB);
    
    const success = await locksService.updateAlbumTitle(lockId, albumTitle);
    if (!success) {
      throw new NotFoundError('Lock');
    }

    Logger.info('Album title updated', { lockId, albumTitle });
    return c.json(ErrorHandler.success(null, 'Album title updated successfully'));
  }
);

app.patch('/admin/locks/:lockId/owner',
  ValidationMiddleware.validate(UpdateOwnerSchema, LockIdParamSchema),
  async (c) => {
    const { lockId } = ValidationMiddleware.getValidatedParams<{ lockId: number }>(c);
    const { userId } = ValidationMiddleware.getValidatedBody<{ userId: number | null }>(c);
    const locksService = new LocksService(c.env.DB);
    
    const success = await locksService.updateLockOwner(lockId, userId);
    if (!success) {
      throw new NotFoundError('Lock');
    }

    Logger.info('Lock owner updated', { lockId, newOwner: userId });
    return c.json(ErrorHandler.success(null, 'Lock owner updated successfully'));
  }
);

app.patch('/admin/locks/:lockId/notifications',
  ValidationMiddleware.validate(UpdateNotificationsSchema, LockIdParamSchema),
  async (c) => {
    const { lockId } = ValidationMiddleware.getValidatedParams<{ lockId: number }>(c);
    const { notifiedWhenScanned } = ValidationMiddleware.getValidatedBody<{ notifiedWhenScanned: boolean }>(c);
    const locksService = new LocksService(c.env.DB);
    
    const success = await locksService.updateNotificationSettings(lockId, notifiedWhenScanned);
    if (!success) {
      throw new NotFoundError('Lock');
    }

    Logger.info('Notification settings updated', { lockId, notifiedWhenScanned });
    return c.json(ErrorHandler.success(null, 'Notification settings updated successfully'));
  }
);

app.get('/admin/locks',
  ValidationMiddleware.validateQuery(PaginationSchema),
  async (c) => {
    const { page, limit } = ValidationMiddleware.getValidatedQuery<{ page: number; limit: number }>(c);
    const locksService = new LocksService(c.env.DB);
    
    const locks = await locksService.getAllLocks(page, limit);
    return c.json(ErrorHandler.success(locks));
  }
);

app.get('/admin/locks/user/:userId',
  ValidationMiddleware.validate(undefined, UserIdParamSchema, PaginationSchema),
  async (c) => {
    const { userId } = ValidationMiddleware.getValidatedParams<{ userId: number }>(c);
    const { page, limit } = ValidationMiddleware.getValidatedQuery<{ page: number; limit: number }>(c);
    const locksService = new LocksService(c.env.DB);
    
    const locks = await locksService.getLocksByUserId(userId, page, limit);
    return c.json(ErrorHandler.success(locks));
  }
);

app.delete('/admin/locks/:lockId',
  ValidationMiddleware.validateParams(LockIdParamSchema),
  async (c) => {
    const { lockId } = ValidationMiddleware.getValidatedParams<{ lockId: number }>(c);
    const locksService = new LocksService(c.env.DB);
    
    const success = await locksService.deleteLock(lockId);
    if (!success) {
      throw new NotFoundError('Lock');
    }

    Logger.info('Lock deleted successfully', { lockId });
    return c.json(ErrorHandler.success(null, 'Lock deleted successfully'));
  }
);

// Statistics endpoints (admin)
app.get('/admin/stats/locks', async (c) => {
  const locksService = new LocksService(c.env.DB);
  const stats = await locksService.getLockStatistics();
  
  return c.json(ErrorHandler.success(stats));
});

app.get('/admin/stats/users', async (c) => {
  const userService = new UserService(c.env.DB);
  const stats = await userService.getUserStatistics();
  
  return c.json(ErrorHandler.success(stats));
});

// API routes with rate limiting
app.use('/api/*', async (c, next) => {
  const clientIP = c.req.header('CF-Connecting-IP') || 'unknown';
  
  if (RateLimitService.isApiRateLimited(clientIP)) {
    throw new RateLimitError();
  }
  
  await next();
});

// Data API endpoints (for main API integration)
app.use('/api/data/*', AuthMiddleware.requireApiKey());

app.get('/api/data/users/by-identifier/:identifier', async (c) => {
  const identifier = c.req.param('identifier');
  if (!identifier) {
    throw new Error('Identifier parameter is required');
  }
  
  const userService = new UserService(c.env.DB);
  const user = await userService.getUserByIdentifier(decodeURIComponent(identifier));
  
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }
  
  Logger.info('User lookup successful', { identifier });
  return c.json(user);
});

app.get('/api/data/users/:userId', async (c) => {
  const userId = parseInt(c.req.param('userId') || '0');
  if (!userId) {
    throw new Error('Invalid user ID');
  }
  
  const userService = new UserService(c.env.DB);
  const user = await userService.getUserById(userId);
  
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }
  
  return c.json(user);
});

app.get('/api/data/users/provider/:provider/:providerId',
  ValidationMiddleware.validateParams(ProviderParamSchema),
  async (c) => {
    const { provider, providerId } = ValidationMiddleware.getValidatedParams<{ provider: string; providerId: string }>(c);
    
    const userService = new UserService(c.env.DB);
    const user = await userService.getUserByProvider(provider, decodeURIComponent(providerId));
    
    if (!user) {
      Logger.warn('User not found by provider', { provider, providerId });
      return c.json({ error: 'User not found' }, 404);
    }
    
    Logger.info('User lookup by provider successful', { 
      provider, 
      providerId, 
      userId: user.id, 
      email: user.email || 'null',
      authProvider: user.AuthProvider 
    });
    return c.json(user);
  }
);

app.post('/api/data/users', 
  ValidationMiddleware.validateBody(CreateUserSchema),
  async (c) => {
    const userData = ValidationMiddleware.getValidatedBody<CreateUserRequest>(c);
    const userService = new UserService(c.env.DB);
    
    const user = await userService.createUser(userData);
    if (!user) {
      throw new DatabaseError('Failed to create user');
    }

    Logger.info('User created via API', { userId: user.id });
    return c.json(user, 201);
  }
);

app.patch('/api/data/users/:userId/last-login', async (c) => {
  const userId = parseInt(c.req.param('userId') || '0');
  if (!userId) {
    throw new Error('Invalid user ID');
  }
  
  const userService = new UserService(c.env.DB);
  const success = await userService.updateUserLoginTime(userId);
  
  if (!success) {
    throw new DatabaseError('Failed to update login time');
  }
  
  Logger.info('User login time updated', { userId });
  return c.json({ success: true });
});

app.delete('/api/data/users/provider/:provider/:providerId',
  ValidationMiddleware.validateParams(ProviderParamSchema),
  async (c) => {
    const { provider, providerId } = ValidationMiddleware.getValidatedParams<{ provider: string; providerId: string }>(c);
    
    const userService = new UserService(c.env.DB);
    const success = await userService.deleteUserByProvider(provider, decodeURIComponent(providerId));
    
    if (!success) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    Logger.info('User deleted by provider', { provider, providerId });
    return c.json({ success: true });
  }
);

// Lock data API endpoints (for main API integration)
app.get('/api/data/locks/:lockId', async (c) => {
  const lockId = parseInt(c.req.param('lockId') || '0');
  if (!lockId) {
    throw new Error('Invalid lock ID');
  }
  
  const locksService = new LocksService(c.env.DB);
  const lock = await locksService.getLockById(lockId);
  
  if (!lock) {
    return c.json({ error: 'Lock not found' }, 404);
  }
  
  return c.json(lock);
});

app.get('/api/data/locks/hashid/:hashId',
  ValidationMiddleware.validateParams(HashIdParamSchema),
  async (c) => {
    const { hashId } = ValidationMiddleware.getValidatedParams<{ hashId: string }>(c);
    const hashidsService = new HashidsService();
    const lockId = hashidsService.decode(hashId);
    
    if (!lockId) {
      return c.json({ error: 'Invalid hash ID' }, 400);
    }

    const locksService = new LocksService(c.env.DB);
    const lock = await locksService.getLockById(lockId);
    
    if (!lock) {
      return c.json({ error: 'Lock not found' }, 404);
    }
    
    return c.json(lock);
  }
);

app.get('/api/data/locks/user/:userId', async (c) => {
  const userId = parseInt(c.req.param('userId') || '0');
  if (!userId || userId <= 0) {
    throw new Error('Invalid user ID: User ID must be a positive integer');
  }
  
  const locksService = new LocksService(c.env.DB);
  const userService = new UserService(c.env.DB);
  
  // Update user's last login time since they're actively using the app
  await userService.updateUserLoginTime(userId).catch(error => {
    Logger.warn('Failed to update user login time', { userId, error: error.message });
  });
  
  const locks = await locksService.getLocksByUserId(userId);
  
  // Transform to the expected format for the mobile app
  const lockDtos = locks.map(lock => ({
    Id: lock.Id,
    LockName: lock.LockName,
    SealDate: lock.SealDate,
    NotifiedWhenScanned: lock.NotifiedWhenScanned,
    ScanCount: lock.ScanCount,
    CreatedAt: lock.CreatedAt
  }));
  
  Logger.info('User locks retrieved via API', { userId, count: locks?.length || 0 });
  return c.json(lockDtos);
});

app.patch('/api/data/locks/:lockId/connect', 
  ValidationMiddleware.validateParams(LockIdParamSchema),
  async (c) => {
    const { lockId } = ValidationMiddleware.getValidatedParams<{ lockId: number }>(c);
    const userId = parseInt(c.req.header('X-User-ID') || '0');
    
    if (!userId) {
      throw new ValidationError('X-User-ID header is required');
    }
  
  const locksService = new LocksService(c.env.DB);
  const success = await locksService.updateLockOwner(lockId, userId);
  
  if (!success) {
    throw new DatabaseError('Failed to connect lock');
  }
  
  Logger.info('Lock connected via API', { lockId, userId });
  return c.json({ success: true });
});

app.patch('/api/data/locks/:lockId/name', async (c) => {
  const lockId = parseInt(c.req.param('lockId') || '0');
  if (!lockId) {
    throw new Error('Invalid lock ID');
  }
  
  const body = await c.req.json();
  const lockName = body.lockName;
  
  if (!lockName || typeof lockName !== 'string') {
    throw new Error('Lock name is required');
  }
  
  const locksService = new LocksService(c.env.DB);
  const success = await locksService.updateLockName(lockId, lockName);
  
  if (!success) {
    throw new DatabaseError('Failed to update lock name');
  }
  
  Logger.info('Lock name updated via API', { lockId, lockName });
  return c.json({ success: true });
});

app.patch('/api/data/locks/:lockId/seal', async (c) => {
  const lockId = parseInt(c.req.param('lockId') || '0');
  if (!lockId) {
    throw new Error('Invalid lock ID');
  }
  
  const body = await c.req.json();
  const sealDate = body.sealDate;
  
  const locksService = new LocksService(c.env.DB);
  const success = await locksService.updateLock(lockId, { sealDate });
  
  if (!success) {
    throw new DatabaseError('Failed to update lock seal');
  }
  
  Logger.info('Lock seal updated via API', { lockId, sealDate });
  return c.json({ success: true });
});

app.patch('/api/data/locks/:lockId/notifications', async (c) => {
  const lockId = parseInt(c.req.param('lockId') || '0');
  if (!lockId) {
    throw new Error('Invalid lock ID');
  }
  
  const body = await c.req.json();
  const notifiedWhenScanned = body.notifiedWhenScanned;
  
  if (typeof notifiedWhenScanned !== 'boolean') {
    throw new Error('notifiedWhenScanned must be a boolean');
  }
  
  const locksService = new LocksService(c.env.DB);
  const success = await locksService.updateNotificationSettings(lockId, notifiedWhenScanned);
  
  if (!success) {
    throw new DatabaseError('Failed to update notification settings');
  }
  
  Logger.info('Lock notifications updated via API', { lockId, notifiedWhenScanned });
  return c.json({ success: true });
});

// MediaObject management routes (for main API integration)
app.post('/api/data/mediaobjects',
  ValidationMiddleware.validateBody(CreateMediaObjectSchema),
  async (c) => {
    const { lockId, cloudflareImageId, url, fileName, mediaType, isMainPicture, displayOrder } = ValidationMiddleware.getValidatedBody<{
      lockId: number;
      cloudflareImageId: string;
      url: string;
      fileName?: string;
      mediaType: string;
      isMainPicture: boolean;
      displayOrder?: number;
    }>(c);
    
    const locksService = new LocksService(c.env.DB);
    
    // Verify lock exists
    const lock = await locksService.getLockById(lockId);
    if (!lock) {
      throw new NotFoundError('Lock');
    }
    
    const mediaObject = await locksService.createMediaObject(
      lockId,
      cloudflareImageId,
      url,
      fileName || null,
      mediaType,
      isMainPicture,
      displayOrder
    );
    
    if (!mediaObject) {
      throw new DatabaseError('Failed to create media object');
    }
    
    Logger.info('MediaObject created via API', { 
      mediaObjectId: mediaObject.Id, 
      lockId, 
      cloudflareImageId,
      mediaType 
    });
    return c.json(mediaObject, 201);
  }
);

app.delete('/api/data/mediaobjects/:mediaObjectId',
  ValidationMiddleware.validateParams(MediaObjectIdParamSchema),
  async (c) => {
    const { mediaObjectId } = ValidationMiddleware.getValidatedParams<{ mediaObjectId: number }>(c);
    
    const locksService = new LocksService(c.env.DB);
    
    // Verify media object exists
    const mediaObject = await locksService.getMediaObjectById(mediaObjectId);
    if (!mediaObject) {
      throw new NotFoundError('MediaObject');
    }
    
    const success = await locksService.deleteMediaObject(mediaObjectId);
    if (!success) {
      throw new DatabaseError('Failed to delete media object');
    }
    
    Logger.info('MediaObject deleted via API', { 
      mediaObjectId, 
      lockId: mediaObject.LockId,
      cloudflareImageId: mediaObject.CloudflareImageId
    });
    return c.json({ success: true });
  }
);

app.get('/api/data/mediaobjects/:mediaObjectId',
  ValidationMiddleware.validateParams(MediaObjectIdParamSchema),
  async (c) => {
    const { mediaObjectId } = ValidationMiddleware.getValidatedParams<{ mediaObjectId: number }>(c);
    
    const locksService = new LocksService(c.env.DB);
    const mediaObject = await locksService.getMediaObjectById(mediaObjectId);
    
    if (!mediaObject) {
      throw new NotFoundError('MediaObject');
    }
    
    return c.json(mediaObject);
  }
);

app.get('/api/data/mediaobjects/lock/:lockId',
  ValidationMiddleware.validateParams(LockIdParamSchema),
  async (c) => {
    const { lockId } = ValidationMiddleware.getValidatedParams<{ lockId: number }>(c);
    
    const locksService = new LocksService(c.env.DB);
    
    // Verify lock exists
    const lock = await locksService.getLockById(lockId);
    if (!lock) {
      throw new NotFoundError('Lock');
    }
    
    const mediaObjects = await locksService.getMediaObjectsByLockId(lockId);
    
    Logger.info('MediaObjects retrieved via API', { lockId, count: mediaObjects.length });
    return c.json(mediaObjects);
  }
);

app.patch('/api/data/mediaobjects/:mediaObjectId/display-order',
  ValidationMiddleware.validateParams(MediaObjectIdParamSchema),
  async (c) => {
    const { mediaObjectId } = ValidationMiddleware.getValidatedParams<{ mediaObjectId: number }>(c);
    
    const body = await c.req.json();
    const displayOrder = body.displayOrder;
    
    if (typeof displayOrder !== 'number') {
      throw new ValidationError('displayOrder must be a number');
    }
    
    const locksService = new LocksService(c.env.DB);
    
    // Verify media object exists
    const mediaObject = await locksService.getMediaObjectById(mediaObjectId);
    if (!mediaObject) {
      throw new NotFoundError('MediaObject');
    }
    
    const success = await locksService.updateMediaDisplayOrder(mediaObjectId, displayOrder);
    if (!success) {
      throw new DatabaseError('Failed to update media display order');
    }
    
    Logger.info('MediaObject display order updated via API', { 
      mediaObjectId, 
      displayOrder,
      lockId: mediaObject.LockId
    });
    return c.json({ success: true });
  }
);

// Authentication routes
app.post('/api/auth/request-code',
  ValidationMiddleware.validateBody(AuthRequestSchema),
  async (c) => {
    const { identifier, type } = ValidationMiddleware.getValidatedBody<{ identifier: string; type: 'email' | 'phone' }>(c);
    const userService = new UserService(c.env.DB);
    
    // This would integrate with email/SMS service
    Logger.info('Authentication code requested', { identifier, type });
    
    return c.json(ErrorHandler.success(null, 'Verification code sent successfully'));
  }
);

app.post('/api/auth/verify-code',
  ValidationMiddleware.validateBody(VerifyCodeSchema),
  async (c) => {
    const { identifier, code, type } = ValidationMiddleware.getValidatedBody<{ identifier: string; code: string; type: string }>(c);
    const userService = new UserService(c.env.DB);
    
    // This would verify the code and create/return user
    Logger.info('Code verification attempted', { identifier, type });
    
    return c.json(ErrorHandler.success({ accessToken: 'mock-token' }, 'Authentication successful'));
  }
);

app.post('/api/auth/social',
  ValidationMiddleware.validateBody(SocialAuthSchema),
  async (c) => {
    const { provider, token } = ValidationMiddleware.getValidatedBody<{ provider: 'google' | 'apple'; token: string }>(c);
    const userService = new UserService(c.env.DB);
    
    // This would verify the social token and create/return user
    Logger.info('Social authentication attempted', { provider });
    
    return c.json(ErrorHandler.success({ accessToken: 'mock-token' }, 'Authentication successful'));
  }
);


// Utility endpoints
app.get('/api/locks/:hashId/exists',
  ValidationMiddleware.validateParams(HashIdParamSchema),
  async (c) => {
    const { hashId } = ValidationMiddleware.getValidatedParams<{ hashId: string }>(c);
    const hashidsService = new HashidsService();
    const lockId = hashidsService.decode(hashId);
    
    if (!lockId) {
      return c.json(ErrorHandler.success({ exists: false }));
    }

    const locksService = new LocksService(c.env.DB);
    const exists = await locksService.lockExists(lockId);
    
    return c.json(ErrorHandler.success({ exists }));
  }
);

// 404 handler
app.notFound((c) => {
  Logger.warn('Route not found', { 
    path: c.req.path, 
    method: c.req.method 
  });
  throw new NotFoundError('Endpoint');
});

export default app;