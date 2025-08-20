import { User, CreateUserRequest } from '../../types/auth';
import { Env } from '../../types/common';
import { DatabaseError } from '../../middleware/errorHandler';

export class UserService {
  constructor(private readonly db: D1Database) {}

  async createUser(userData: CreateUserRequest): Promise<User | null> {
    try {
      const insertResult = await this.db.prepare(`
        INSERT INTO users (
          email, PhoneNumber, AuthProvider, ProviderId, name, 
          EmailVerified, PhoneVerified
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        userData.email || null,
        userData.PhoneNumber || null,
        userData.AuthProvider || 'email',
        userData.ProviderId || null,
        userData.name || null,
        userData.EmailVerified ? 1 : 0,
        userData.PhoneVerified ? 1 : 0
      ).run();

      if (insertResult.success && (insertResult as any).meta?.last_row_id !== undefined) {
        return {
          id: (insertResult as any).meta.last_row_id as number,
          email: userData.email,
          PhoneNumber: userData.PhoneNumber,
          AuthProvider: userData.AuthProvider || 'email',
          ProviderId: userData.ProviderId,
          name: userData.name,
          EmailVerified: userData.EmailVerified || false,
          PhoneVerified: userData.PhoneVerified || false,
          CreatedAt: new Date().toISOString(),
          UpdatedAt: new Date().toISOString()
        };
      }
      return null;
    } catch (error) {
      console.error('Error creating user:', error);
      throw new DatabaseError('Failed to create user');
    }
  }

  async getUserByIdentifier(identifier: string): Promise<User | null> {
    try {
      const user = await this.db.prepare(`
        SELECT * FROM users WHERE email = ? OR PhoneNumber = ? LIMIT 1
      `).bind(identifier, identifier).first() as User | null;
      
      return user;
    } catch (error) {
      console.error('Error getting user by identifier:', error);
      throw new DatabaseError('Failed to retrieve user');
    }
  }

  async getUserById(userId: number): Promise<User | null> {
    try {
      const user = await this.db.prepare(`
        SELECT * FROM users WHERE id = ? LIMIT 1
      `).bind(userId).first() as User | null;
      
      return user;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      throw new DatabaseError('Failed to retrieve user');
    }
  }

  async updateUserLoginTime(userId: number): Promise<boolean> {
    try {
      const result = await this.db.prepare(`
        UPDATE users SET LastLoginAt = datetime('now', '+2 hours'), UpdatedAt = datetime('now', '+2 hours') 
        WHERE id = ?
      `).bind(userId).run();

      return result.success;
    } catch (error) {
      console.error('Error updating user login time:', error);
      throw new DatabaseError('Failed to update login time');
    }
  }

  async deleteUserByProvider(provider: string, providerId: string): Promise<boolean> {
    try {
      // First get the user to check if they exist
      const user = await this.db.prepare(`
        SELECT id FROM users WHERE AuthProvider = ? AND ProviderId = ? LIMIT 1
      `).bind(provider, providerId).first() as { id: number } | null;

      if (!user) {
        return false;
      }

      // Delete user (cascade should handle related data)
      const result = await this.db.prepare(`
        DELETE FROM users WHERE AuthProvider = ? AND ProviderId = ?
      `).bind(provider, providerId).run();

      return result.success;
    } catch (error) {
      console.error('Error deleting user by provider:', error);
      throw new DatabaseError('Failed to delete user');
    }
  }

  async getUserStats(): Promise<{ total: number; verified: number }> {
    try {
      const totalResult = await this.db.prepare(`
        SELECT COUNT(*) as count FROM users
      `).first() as { count: number } | null;

      const verifiedResult = await this.db.prepare(`
        SELECT COUNT(*) as count FROM users WHERE EmailVerified = 1 OR PhoneVerified = 1
      `).first() as { count: number } | null;

      return {
        total: totalResult?.count || 0,
        verified: verifiedResult?.count || 0
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw new DatabaseError('Failed to get user statistics');
    }
  }

  // Additional methods needed by index.ts
  async getAllUsers(page: number = 1, limit: number = 20): Promise<User[]> {
    try {
      const offset = (page - 1) * limit;
      const result = await this.db.prepare(`
        SELECT * FROM users ORDER BY CreatedAt DESC LIMIT ? OFFSET ?
      `).bind(limit, offset).all() as { results: User[] };

      return result.results || [];
    } catch (error) {
      console.error('Error getting all users:', error);
      throw new DatabaseError('Failed to retrieve users');
    }
  }

  async getUserStatistics(): Promise<any> {
    return this.getUserStats();
  }

  async getUserByProvider(provider: string, providerId: string): Promise<User | null> {
    try {
      const user = await this.db.prepare(`
        SELECT * FROM users WHERE AuthProvider = ? AND ProviderId = ? LIMIT 1
      `).bind(provider, providerId).first() as User | null;
      
      return user;
    } catch (error) {
      console.error('Error getting user by provider:', error);
      throw new DatabaseError('Failed to retrieve user by provider');
    }
  }

  async upgradeToPremiumStorage(userId: number): Promise<User | null> {
    try {
      // Update the user's premium storage status
      const updateResult = await this.db.prepare(`
        UPDATE users SET HasPremiumStorage = 1, UpdatedAt = datetime('now', '+2 hours') 
        WHERE id = ?
      `).bind(userId).run();

      if (updateResult.success) {
        // Return the updated user
        return await this.getUserById(userId);
      }
      return null;
    } catch (error) {
      console.error('Error upgrading user to premium storage:', error);
      throw new DatabaseError('Failed to upgrade user to premium storage');
    }
  }
}