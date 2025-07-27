import { Lock, MediaObject, LockWithMedia, AlbumResponse, EnhancedMediaObject, BulkLockGenerationResponse } from '../../types/locks';
import { Env } from '../../types/common';
import { DatabaseError } from '../../middleware/errorHandler';

export class LocksService {
  constructor(private readonly db: D1Database) {}

  // Lock creation and generation
  async generateBulkLocks(count: number, prefix?: string): Promise<BulkLockGenerationResponse> {
    try {
      const createdLocks: number[] = [];
      
      for (let i = 0; i < count; i++) {
        const lockName = prefix ? `${prefix}-${i + 1}` : null;
        
        const result = await this.db.prepare(`
          INSERT INTO Locks (LockName, AlbumTitle, NotifiedWhenScanned, ScanCount, CreatedAt) 
          VALUES (?, ?, ?, ?, ?)
        `).bind(
          lockName,
          null, // AlbumTitle starts as null
          false, // NotifiedWhenScanned starts as false
          0, // ScanCount starts at 0
          new Date().toISOString()
        ).run();

        if (result.success && (result as any).meta?.last_row_id) {
          createdLocks.push((result as any).meta.last_row_id as number);
        }
      }

      const startId = Math.min(...createdLocks);
      const endId = Math.max(...createdLocks);

      return {
        success: true,
        message: `Successfully generated ${createdLocks.length} locks`,
        generated: createdLocks.length,
        startId,
        endId
      };
    } catch (error) {
      console.error('Error generating bulk locks:', error);
      throw new DatabaseError('Failed to generate locks');
    }
  }

  // Lock retrieval
  async getLockById(lockId: number): Promise<Lock | null> {
    try {
      const lock = await this.db.prepare(`
        SELECT 
          id as Id,
          LockName,
          AlbumTitle,
          SealDate,
          NotifiedWhenScanned,
          ScanCount,
          CreatedAt,
          UserId
        FROM locks WHERE id = ? LIMIT 1
      `).bind(lockId).first() as Lock | null;
      
      return lock;
    } catch (error) {
      console.error('Error getting lock by ID:', error);
      throw new DatabaseError('Failed to retrieve lock');
    }
  }

  async getAlbumData(lockId: number, accountHash: string): Promise<AlbumResponse | null> {
    try {
      // Get lock details
      const lock = await this.getLockById(lockId);
      if (!lock) return null;

      // Get media objects for the lock
      const mediaObjects = await this.getMediaObjectsByLockId(lockId);
      
      // DEBUG: Log media objects to understand structure
      console.log('🔍 DEBUG - MediaObjects for lockId', lockId, ':', JSON.stringify(mediaObjects, null, 2));
      
      // Enhance media objects with custom domain URLs
      const enhancedMedia: EnhancedMediaObject[] = mediaObjects.map(media => {
        const isMainPic = Boolean(media.IsMainPicture);
        
        // DEBUG: Log each media object processing
        console.log(`🔍 DEBUG - Media ${media.Id}: IsMainPicture=${media.IsMainPicture}, Boolean(IsMainPicture)=${isMainPic}`);
        
        return {
          ...media,
          urls: {
            public: `https://media.memorylocks.com/${media.CloudflareImageId}/public`,
            profile: isMainPic 
              ? `https://media.memorylocks.com/${media.CloudflareImageId}/w=1080,h=auto,fit=scale-down`
              : `https://media.memorylocks.com/${media.CloudflareImageId}/public`
          }
        };
      });

      return {
        lockName: lock.LockName || 'Untitled Lock',
        albumTitle: lock.AlbumTitle || 'Memory Album',
        sealDate: lock.SealDate || undefined,
        media: enhancedMedia
      };
    } catch (error) {
      console.error('Error getting album data:', error);
      throw new DatabaseError('Failed to retrieve album data');
    }
  }

  async getUserLocks(userId: number): Promise<LockWithMedia[]> {
    try {
      // Get all locks for the user
      const locks = await this.db.prepare(`
        SELECT * FROM Locks WHERE UserId = ? ORDER BY CreatedAt DESC
      `).bind(userId).all() as { results: Lock[] };

      if (!locks.results.length) {
        return [];
      }

      // Extract lock IDs for bulk media query
      const lockIds = locks.results.map(lock => lock.Id);
      const placeholders = lockIds.map(() => '?').join(',');

      // Bulk fetch all media objects to avoid N+1 problem
      const mediaObjects = await this.db.prepare(`
        SELECT * FROM MediaObjects WHERE LockId IN (${placeholders}) ORDER BY LockId, CreatedAt
      `).bind(...lockIds).all() as { results: MediaObject[] };

      // Group media by lock ID
      const mediaByLockId: { [lockId: number]: MediaObject[] } = {};
      mediaObjects.results.forEach(media => {
        if (!mediaByLockId[media.LockId]) {
          mediaByLockId[media.LockId] = [];
        }
        mediaByLockId[media.LockId].push(media);
      });

      // Combine locks with their media
      const locksWithMedia: LockWithMedia[] = locks.results.map(lock => ({
        ...lock,
        media: mediaByLockId[lock.Id] || []
      }));

      return locksWithMedia;
    } catch (error) {
      console.error('Error getting user locks:', error);
      throw new DatabaseError('Failed to retrieve user locks');
    }
  }

  // Lock updates
  async updateLockNotifications(lockId: number, notifiedWhenScanned: boolean): Promise<boolean> {
    try {
      const result = await this.db.prepare(`
        UPDATE Locks SET NotifiedWhenScanned = ? WHERE Id = ?
      `).bind(notifiedWhenScanned, lockId).run();

      return result.success;
    } catch (error) {
      console.error('Error updating lock notifications:', error);
      throw new DatabaseError('Failed to update lock notifications');
    }
  }

  async sealLock(lockId: number): Promise<boolean> {
    try {
      const result = await this.db.prepare(`
        UPDATE Locks SET SealDate = ? WHERE Id = ?
      `).bind(new Date().toISOString(), lockId).run();

      return result.success;
    } catch (error) {
      console.error('Error sealing lock:', error);
      throw new DatabaseError('Failed to seal lock');
    }
  }

  async unsealLock(lockId: number): Promise<boolean> {
    try {
      const result = await this.db.prepare(`
        UPDATE Locks SET SealDate = NULL WHERE Id = ?
      `).bind(lockId).run();

      return result.success;
    } catch (error) {
      console.error('Error unsealing lock:', error);
      throw new DatabaseError('Failed to unseal lock');
    }
  }

  async updateLockName(lockId: number, lockName: string): Promise<boolean> {
    try {
      const result = await this.db.prepare(`
        UPDATE Locks SET LockName = ? WHERE Id = ?
      `).bind(lockName, lockId).run();

      return result.success;
    } catch (error) {
      console.error('Error updating lock name:', error);
      throw new DatabaseError('Failed to update lock name');
    }
  }

  async updateAlbumTitle(lockId: number, albumTitle: string): Promise<boolean> {
    try {
      const result = await this.db.prepare(`
        UPDATE Locks SET AlbumTitle = ? WHERE Id = ?
      `).bind(albumTitle, lockId).run();

      return result.success;
    } catch (error) {
      console.error('Error updating album title:', error);
      throw new DatabaseError('Failed to update album title');
    }
  }

  async updateLockOwner(lockId: number, userId: number | null): Promise<boolean> {
    try {
      const result = await this.db.prepare(`
        UPDATE Locks SET UserId = ? WHERE Id = ?
      `).bind(userId, lockId).run();

      return result.success;
    } catch (error) {
      console.error('Error updating lock owner:', error);
      throw new DatabaseError('Failed to update lock owner');
    }
  }

  async clearUserFromLocks(userId: number): Promise<{ affected: number; locks: Array<{ id: number; name?: string; title?: string }> }> {
    try {
      // First get the locks that will be affected
      const locksResult = await this.db.prepare(`
        SELECT Id, LockName, AlbumTitle FROM Locks WHERE UserId = ?
      `).bind(userId).all() as { results: Array<{ Id: number; LockName?: string; AlbumTitle?: string }> };

      const affectedLocks = locksResult.results.map(lock => ({
        id: lock.Id,
        name: lock.LockName,
        title: lock.AlbumTitle
      }));

      // Clear user association from all their locks
      const updateResult = await this.db.prepare(`
        UPDATE Locks SET UserId = NULL WHERE UserId = ?
      `).bind(userId).run();

      return {
        affected: updateResult.success ? affectedLocks.length : 0,
        locks: affectedLocks
      };
    } catch (error) {
      console.error('Error clearing user from locks:', error);
      throw new DatabaseError('Failed to clear user from locks');
    }
  }

  // Media operations
  async getMediaObjectsByLockId(lockId: number): Promise<MediaObject[]> {
    try {
      const mediaResult = await this.db.prepare(`
        SELECT 
          id as Id,
          LockId,
          CloudflareImageId,
          Url,
          FileName,
          MediaType,
          IsMainPicture,
          CreatedAt
        FROM mediaobjects WHERE LockId = ? ORDER BY CreatedAt
      `).bind(lockId).all() as { results: MediaObject[] };

      // DEBUG: Log raw database results
      console.log('🔍 DEBUG - Raw DB results for lockId', lockId, ':', JSON.stringify(mediaResult.results, null, 2));

      return mediaResult.results || [];
    } catch (error) {
      console.error('Error getting media objects:', error);
      throw new DatabaseError('Failed to retrieve media objects');
    }
  }

  // Statistics and analytics
  async getLockStats(): Promise<{ 
    total: number; 
    sealed: number; 
    withUsers: number; 
    withMedia: number 
  }> {
    try {
      const [totalResult, sealedResult, withUsersResult, withMediaResult] = await Promise.all([
        this.db.prepare(`SELECT COUNT(*) as count FROM Locks`).first(),
        this.db.prepare(`SELECT COUNT(*) as count FROM Locks WHERE SealDate IS NOT NULL`).first(),
        this.db.prepare(`SELECT COUNT(*) as count FROM Locks WHERE UserId IS NOT NULL`).first(),
        this.db.prepare(`SELECT COUNT(DISTINCT LockId) as count FROM MediaObjects`).first()
      ]);

      return {
        total: (totalResult as any)?.count || 0,
        sealed: (sealedResult as any)?.count || 0,
        withUsers: (withUsersResult as any)?.count || 0,
        withMedia: (withMediaResult as any)?.count || 0
      };
    } catch (error) {
      console.error('Error getting lock stats:', error);
      throw new DatabaseError('Failed to get lock statistics');
    }
  }

  // Additional methods needed by index.ts
  async incrementScanCount(lockId: number): Promise<void> {
    try {
      await this.db.prepare(`
        UPDATE Locks SET ScanCount = ScanCount + 1 WHERE Id = ?
      `).bind(lockId).run();
    } catch (error) {
      console.error('Error incrementing scan count:', error);
      throw new DatabaseError('Failed to increment scan count');
    }
  }

  async updateLock(lockId: number, updates: any): Promise<boolean> {
    try {
      // Build dynamic SQL to only update provided fields
      const setParts: string[] = [];
      const bindings: any[] = [];

      if (updates.lockName !== undefined) {
        setParts.push('LockName = ?');
        bindings.push(updates.lockName);
      }

      if (updates.albumTitle !== undefined) {
        setParts.push('AlbumTitle = ?');
        bindings.push(updates.albumTitle);
      }

      if (updates.sealDate !== undefined) {
        setParts.push('SealDate = ?');
        bindings.push(updates.sealDate);
      }

      if (updates.notifiedWhenScanned !== undefined) {
        setParts.push('NotifiedWhenScanned = ?');
        bindings.push(updates.notifiedWhenScanned);
      }

      if (setParts.length === 0) {
        // No updates to apply
        return true;
      }

      bindings.push(lockId);

      const result = await this.db.prepare(`
        UPDATE Locks SET ${setParts.join(', ')} WHERE Id = ?
      `).bind(...bindings).run();

      return result.success;
    } catch (error) {
      console.error('Error updating lock:', error);
      throw new DatabaseError('Failed to update lock');
    }
  }

  async updateNotificationSettings(lockId: number, notifiedWhenScanned: boolean): Promise<boolean> {
    try {
      const result = await this.db.prepare(`
        UPDATE Locks SET NotifiedWhenScanned = ? WHERE Id = ?
      `).bind(notifiedWhenScanned, lockId).run();

      return result.success;
    } catch (error) {
      console.error('Error updating notification settings:', error);
      throw new DatabaseError('Failed to update notification settings');
    }
  }

  async getAllLocks(page: number = 1, limit: number = 20): Promise<Lock[]> {
    try {
      const offset = (page - 1) * limit;
      const result = await this.db.prepare(`
        SELECT * FROM Locks ORDER BY CreatedAt DESC LIMIT ? OFFSET ?
      `).bind(limit, offset).all() as { results: Lock[] };

      return result.results || [];
    } catch (error) {
      console.error('Error getting all locks:', error);
      throw new DatabaseError('Failed to retrieve locks');
    }
  }

  async getLocksByUserId(userId: number, page: number = 1, limit: number = 20): Promise<Lock[]> {
    try {
      const offset = (page - 1) * limit;
      const result = await this.db.prepare(`
        SELECT * FROM Locks WHERE UserId = ? ORDER BY CreatedAt DESC LIMIT ? OFFSET ?
      `).bind(userId, limit, offset).all() as { results: Lock[] };

      return result.results || [];
    } catch (error) {
      console.error('Error getting locks by user ID:', error);
      throw new DatabaseError('Failed to retrieve user locks');
    }
  }

  async deleteLock(lockId: number): Promise<boolean> {
    try {
      // Delete associated media objects first
      await this.db.prepare(`
        DELETE FROM MediaObjects WHERE LockId = ?
      `).bind(lockId).run();

      // Delete the lock
      const result = await this.db.prepare(`
        DELETE FROM Locks WHERE Id = ?
      `).bind(lockId).run();

      return result.success;
    } catch (error) {
      console.error('Error deleting lock:', error);
      throw new DatabaseError('Failed to delete lock');
    }
  }

  async getLockStatistics(): Promise<any> {
    return this.getLockStats();
  }

  async lockExists(lockId: number): Promise<boolean> {
    try {
      const result = await this.db.prepare(`
        SELECT 1 FROM Locks WHERE Id = ? LIMIT 1
      `).bind(lockId).first();

      return result !== null;
    } catch (error) {
      console.error('Error checking if lock exists:', error);
      return false;
    }
  }
}