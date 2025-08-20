import { Lock, MediaObject, LockWithMedia, AlbumResponse, BulkLockGenerationResponse } from '../../types/locks';
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
          INSERT INTO locks (LockName, AlbumTitle, NotifiedWhenScanned, ScanCount, CreatedAt) 
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
      
      // Return media objects directly without URL enhancement
      // URLs are now stored as /standard variant in database
      return {
        lockName: lock.LockName || 'Untitled Lock',
        albumTitle: lock.AlbumTitle || 'Memory Album',
        sealDate: lock.SealDate || undefined,
        media: mediaObjects
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
        SELECT * FROM locks WHERE UserId = ? ORDER BY CreatedAt DESC
      `).bind(userId).all() as { results: Lock[] };

      if (!locks.results.length) {
        return [];
      }

      // Extract lock IDs for bulk media query
      const lockIds = locks.results.map(lock => lock.Id);
      const placeholders = lockIds.map(() => '?').join(',');

      // Bulk fetch all media objects to avoid N+1 problem
      const mediaObjects = await this.db.prepare(`
        SELECT * FROM mediaobjects WHERE LockId IN (${placeholders}) ORDER BY LockId, DisplayOrder ASC, CreatedAt ASC
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
        UPDATE locks SET NotifiedWhenScanned = ? WHERE Id = ?
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
        UPDATE locks SET SealDate = ? WHERE Id = ?
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
        UPDATE locks SET SealDate = NULL WHERE Id = ?
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
        UPDATE locks SET LockName = ? WHERE Id = ?
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
        UPDATE locks SET AlbumTitle = ? WHERE Id = ?
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
        UPDATE locks SET UserId = ? WHERE Id = ?
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
        SELECT Id, LockName, AlbumTitle FROM locks WHERE UserId = ?
      `).bind(userId).all() as { results: Array<{ Id: number; LockName?: string; AlbumTitle?: string }> };

      const affectedLocks = locksResult.results.map(lock => ({
        id: lock.Id,
        name: lock.LockName,
        title: lock.AlbumTitle
      }));

      // Clear user association from all their locks
      const updateResult = await this.db.prepare(`
        UPDATE locks SET UserId = NULL WHERE UserId = ?
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
          CreatedAt,
          DisplayOrder
        FROM mediaobjects WHERE LockId = ? ORDER BY DisplayOrder ASC, CreatedAt ASC
      `).bind(lockId).all() as { results: any[] };

      // DEBUG: Log raw database results
      console.log('🔍 DEBUG - Raw DB results for lockId', lockId, ':', JSON.stringify(mediaResult.results, null, 2));

      // Convert SQLite results to proper MediaObject format
      const formattedResults: MediaObject[] = (mediaResult.results || []).map(raw => ({
        Id: raw.Id,
        LockId: raw.LockId,
        CloudflareImageId: raw.CloudflareImageId,
        Url: raw.Url,
        FileName: raw.FileName || undefined,
        MediaType: raw.MediaType,
        IsMainPicture: raw.IsMainPicture === 1, // Convert SQLite integer to boolean
        CreatedAt: raw.CreatedAt,
        DisplayOrder: raw.DisplayOrder || undefined // Convert null to undefined for consistency
      }));

      console.log('🔍 DEBUG - Formatted results for lockId', lockId, ':', JSON.stringify(formattedResults, null, 2));

      return formattedResults;
    } catch (error) {
      console.error('Error getting media objects:', error);
      throw new DatabaseError('Failed to retrieve media objects');
    }
  }

  async createMediaObject(
    lockId: number, 
    cloudflareImageId: string, 
    url: string, 
    fileName: string | null, 
    mediaType: string, 
    isMainPicture: boolean = false,
    displayOrder?: number
  ): Promise<MediaObject | null> {
    try {
      console.log('🔍 DEBUG - Creating MediaObject:', { lockId, cloudflareImageId, url, fileName, mediaType, isMainPicture, displayOrder });
      
      const result = await this.db.prepare(`
        INSERT INTO mediaobjects (LockId, CloudflareImageId, Url, FileName, MediaType, IsMainPicture, CreatedAt, DisplayOrder)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        lockId,
        cloudflareImageId,
        url,
        fileName,
        mediaType,
        isMainPicture ? 1 : 0,
        new Date().toISOString(),
        displayOrder !== undefined ? displayOrder : null
      ).run();

      console.log('🔍 DEBUG - Insert result:', { success: result.success, meta: (result as any).meta });

      if (!result.success || !(result as any).meta?.last_row_id) {
        console.error('🔍 DEBUG - Failed to insert MediaObject - result was not successful or no last_row_id');
        return null;
      }

      // Fetch the created media object
      const mediaObjectId = (result as any).meta.last_row_id as number;
      console.log('🔍 DEBUG - MediaObject created with ID:', mediaObjectId);
      
      const rawMediaObject = await this.db.prepare(`
        SELECT 
          id as Id,
          LockId,
          CloudflareImageId,
          Url,
          FileName,
          MediaType,
          IsMainPicture,
          CreatedAt,
          DisplayOrder
        FROM mediaobjects WHERE id = ?
      `).bind(mediaObjectId).first() as any;

      if (!rawMediaObject) {
        console.error('🔍 DEBUG - Could not retrieve created MediaObject with ID:', mediaObjectId);
        return null;
      }

      // Convert SQLite integer to boolean and ensure proper format for API consumption
      const mediaObject: MediaObject = {
        Id: rawMediaObject.Id,
        LockId: rawMediaObject.LockId,
        CloudflareImageId: rawMediaObject.CloudflareImageId,
        Url: rawMediaObject.Url,
        FileName: rawMediaObject.FileName || undefined,
        MediaType: rawMediaObject.MediaType,
        IsMainPicture: rawMediaObject.IsMainPicture === 1, // Convert SQLite integer to boolean
        CreatedAt: rawMediaObject.CreatedAt,
        DisplayOrder: rawMediaObject.DisplayOrder || undefined // Convert null to undefined for consistency
      };

      console.log('🔍 DEBUG - Formatted MediaObject for API:', mediaObject);
      return mediaObject;
    } catch (error) {
      console.error('🔍 DEBUG - Error creating media object:', error);
      throw new DatabaseError('Failed to create media object');
    }
  }

  async deleteMediaObject(mediaObjectId: number): Promise<boolean> {
    try {
      const result = await this.db.prepare(`
        DELETE FROM mediaobjects WHERE id = ?
      `).bind(mediaObjectId).run();

      // Consider deletion successful if:
      // 1. The SQL operation succeeded, AND
      // 2. Either we deleted a row (changes > 0) OR no row existed to delete (changes = 0)
      // This makes deletion idempotent - if object doesn't exist, still return success
      const deletionSuccessful = result.success;
      const rowsAffected = result.changes || 0;
      
      console.log(`🔍 DEBUG - Media object ${mediaObjectId} deletion: success=${result.success}, changes=${rowsAffected}`);
      
      return deletionSuccessful;
    } catch (error) {
      console.error('Error deleting media object:', error);
      throw new DatabaseError('Failed to delete media object');
    }
  }

  async updateMediaDisplayOrder(mediaObjectId: number, displayOrder: number): Promise<boolean> {
    try {
      const result = await this.db.prepare(`
        UPDATE mediaobjects SET DisplayOrder = ? WHERE id = ?
      `).bind(displayOrder, mediaObjectId).run();

      return result.success;
    } catch (error) {
      console.error('Error updating media display order:', error);
      throw new DatabaseError('Failed to update media display order');
    }
  }

  async getMediaObjectById(mediaObjectId: number): Promise<MediaObject | null> {
    try {
      const rawMediaObject = await this.db.prepare(`
        SELECT 
          id as Id,
          LockId,
          CloudflareImageId,
          Url,
          FileName,
          MediaType,
          IsMainPicture,
          CreatedAt,
          DisplayOrder
        FROM mediaobjects WHERE id = ?
      `).bind(mediaObjectId).first() as any;

      if (!rawMediaObject) {
        return null;
      }

      // Convert SQLite result to proper MediaObject format
      const mediaObject: MediaObject = {
        Id: rawMediaObject.Id,
        LockId: rawMediaObject.LockId,
        CloudflareImageId: rawMediaObject.CloudflareImageId,
        Url: rawMediaObject.Url,
        FileName: rawMediaObject.FileName || undefined,
        MediaType: rawMediaObject.MediaType,
        IsMainPicture: rawMediaObject.IsMainPicture === 1, // Convert SQLite integer to boolean
        CreatedAt: rawMediaObject.CreatedAt,
        DisplayOrder: rawMediaObject.DisplayOrder || undefined // Convert null to undefined for consistency
      };

      return mediaObject;
    } catch (error) {
      console.error('Error getting media object by ID:', error);
      throw new DatabaseError('Failed to retrieve media object');
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
        this.db.prepare(`SELECT COUNT(*) as count FROM locks`).first(),
        this.db.prepare(`SELECT COUNT(*) as count FROM locks WHERE SealDate IS NOT NULL`).first(),
        this.db.prepare(`SELECT COUNT(*) as count FROM locks WHERE UserId IS NOT NULL`).first(),
        this.db.prepare(`SELECT COUNT(DISTINCT LockId) as count FROM mediaobjects`).first()
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
        UPDATE locks SET ScanCount = ScanCount + 1 WHERE Id = ?
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
        UPDATE locks SET ${setParts.join(', ')} WHERE Id = ?
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
        UPDATE locks SET NotifiedWhenScanned = ? WHERE Id = ?
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
        SELECT * FROM locks ORDER BY CreatedAt DESC LIMIT ? OFFSET ?
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
        SELECT * FROM locks WHERE UserId = ? ORDER BY CreatedAt DESC LIMIT ? OFFSET ?
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
        DELETE FROM mediaobjects WHERE LockId = ?
      `).bind(lockId).run();

      // Delete the lock
      const result = await this.db.prepare(`
        DELETE FROM locks WHERE Id = ?
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
        SELECT 1 FROM locks WHERE Id = ? LIMIT 1
      `).bind(lockId).first();

      return result !== null;
    } catch (error) {
      console.error('Error checking if lock exists:', error);
      return false;
    }
  }
}