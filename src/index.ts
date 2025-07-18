import { Hono } from 'hono';
import { cors } from 'hono/cors';
import Hashids from 'hashids';

// Type definitions for Cloudflare environment
interface Env {
  DB: D1Database;
}

// Data models matching our C# models
interface Lock {
  id: number;
  lockname?: string;
  albumtitle?: string;
  sealdate?: string;
  notifiedwhenscanned: boolean;
  scancount: number;
  createdat: string;
  auth0userid?: string;
}

interface MediaObject {
  id: number;
  lockid: number;
  cloudflareimageid: string;
  url: string;
  filename?: string;
  mediatype: string;
  isprofilepicture: boolean;
  createdat: string;
}

interface AlbumResponse {
  lockName: string;
  albumTitle: string;
  sealDate?: string;
  media: MediaObject[];
}

interface LockWithMedia extends Lock {
  media: MediaObject[];
}

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('/api/*', cors({
  origin: ['https://album.memorylocks.com', 'https://memorylocks-api.fly.dev'],
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// Helper function to decode hashids
function decodeHashId(hashId: string): number | null {
  const hashidsInstance = new Hashids('GzFbxMxQkArX1cLMo3tnGmpNxL5lUOROXXum5xfhiPU=', 6);
  const decoded = hashidsInstance.decode(hashId);
  return decoded.length > 0 ? decoded[0] as number : null;
}

// WEB ALBUM ENDPOINT
// GET /api/album/{hashId} - Returns album title, seal date, and all media objects for that lock
app.get('/api/album/:hashId', async (c) => {
  try {
    const hashId = c.req.param('hashId');
    const lockId = decodeHashId(hashId);
    
    if (!lockId) {
      return c.json({ error: 'Invalid lock ID' }, 400);
    }

    // Get lock details
    const lockResult = await c.env.DB.prepare('SELECT * FROM locks WHERE id = ?')
      .bind(lockId)
      .first<Lock>();

    if (!lockResult) {
      return c.json({ error: 'Lock not found' }, 404);
    }

    // Get media objects for this lock
    const mediaResults = await c.env.DB.prepare('SELECT * FROM mediaobjects WHERE lockid = ? ORDER BY createdat')
      .bind(lockId)
      .all<MediaObject>();

    const response: AlbumResponse = {
      lockName: lockResult.lockname || 'Memory Lock',
      albumTitle: lockResult.albumtitle || 'Wonderful Memories',
      sealDate: lockResult.sealdate || undefined,
      media: mediaResults.results || []
    };

    return c.json(response);
  } catch (error) {
    console.error('Error fetching album:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// MOBILE APP ENDPOINTS

// GET /api/locks/user/{auth0UserId} - Get all locks for user
app.get('/api/locks/user/:auth0UserId', async (c) => {
  try {
    const auth0UserId = c.req.param('auth0UserId');

    // Get all locks for the user
    const locksResult = await c.env.DB.prepare('SELECT * FROM locks WHERE auth0userid = ? ORDER BY createdat DESC')
      .bind(auth0UserId)
      .all<Lock>();

    if (!locksResult.results) {
      return c.json([]);
    }

    // Get media for each lock
    const locksWithMedia: LockWithMedia[] = [];
    
    for (const lock of locksResult.results) {
      const mediaResult = await c.env.DB.prepare('SELECT * FROM mediaobjects WHERE lockid = ? ORDER BY createdat')
        .bind(lock.id)
        .all<MediaObject>();
      
      locksWithMedia.push({
        ...lock,
        media: mediaResult.results || []
      });
    }

    return c.json(locksWithMedia);
  } catch (error) {
    console.error('Error fetching user locks:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /api/locks/{id}/notifications - Toggle NotifiedWhenScanned
app.patch('/api/locks/:id/notifications', async (c) => {
  try {
    const lockId = parseInt(c.req.param('id'));
    const { notifiedWhenScanned } = await c.req.json();

    const result = await c.env.DB.prepare('UPDATE locks SET notifiedwhenscanned = ? WHERE id = ?')
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
    const lockId = parseInt(c.req.param('id'));
    const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const result = await c.env.DB.prepare('UPDATE locks SET sealdate = ? WHERE id = ?')
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
    const lockId = parseInt(c.req.param('id'));

    const result = await c.env.DB.prepare('UPDATE locks SET sealdate = NULL WHERE id = ?')
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
    const lockId = parseInt(c.req.param('id'));
    const { lockName } = await c.req.json();

    const result = await c.env.DB.prepare('UPDATE locks SET lockname = ? WHERE id = ?')
      .bind(lockName, lockId)
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
    const lockId = parseInt(c.req.param('id'));
    const { albumTitle } = await c.req.json();

    const result = await c.env.DB.prepare('UPDATE locks SET albumtitle = ? WHERE id = ?')
      .bind(albumTitle, lockId)
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

// PATCH /api/locks/{id}/owner - Update Auth0UserId
app.patch('/api/locks/:id/owner', async (c) => {
  try {
    const lockId = parseInt(c.req.param('id'));
    const { auth0UserId } = await c.req.json();

    const result = await c.env.DB.prepare('UPDATE locks SET auth0userid = ? WHERE id = ?')
      .bind(auth0UserId, lockId)
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
  return c.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (c) => {
  return c.json({ 
    message: 'Memory Locks Worker API',
    version: '1.0.0',
    endpoints: {
      album: 'GET /api/album/{hashId}',
      userLocks: 'GET /api/locks/user/{auth0UserId}',
      toggleNotifications: 'PATCH /api/locks/{id}/notifications',
      sealLock: 'PATCH /api/locks/{id}/seal',
      unsealLock: 'PATCH /api/locks/{id}/unseal',
      updateLockName: 'PATCH /api/locks/{id}/name',
      updateAlbumTitle: 'PATCH /api/locks/{id}/album-title',
      updateOwner: 'PATCH /api/locks/{id}/owner'
    }
  });
});

export default app;