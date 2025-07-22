import { User, CreateUserRequest } from '../../types/auth';
import { Env } from '../../types/common';

export class UserService {
  constructor(private readonly db: D1Database) {}

  async createUser(userData: CreateUserRequest): Promise<User | null> {
    try {
      const insertResult = await this.db.prepare(`
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

      if (insertResult.success && (insertResult as any).meta?.last_row_id) {
        return {
          id: (insertResult as any).meta.last_row_id as number,
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
      throw new Error('Failed to create user');
    }
  }

  async getUserByIdentifier(identifier: string): Promise<User | null> {
    try {
      const user = await this.db.prepare(`
        SELECT * FROM users WHERE email = ? OR phone_number = ? LIMIT 1
      `).bind(identifier, identifier).first() as User | null;
      
      return user;
    } catch (error) {
      console.error('Error getting user by identifier:', error);
      throw new Error('Failed to retrieve user');
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
      throw new Error('Failed to retrieve user');
    }
  }

  async updateUserLoginTime(userId: number): Promise<boolean> {
    try {
      const result = await this.db.prepare(`
        UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now') 
        WHERE id = ?
      `).bind(userId).run();

      return result.success;
    } catch (error) {
      console.error('Error updating user login time:', error);
      throw new Error('Failed to update login time');
    }
  }

  async deleteUserByProvider(provider: string, providerId: string): Promise<boolean> {
    try {
      // First get the user to check if they exist
      const user = await this.db.prepare(`
        SELECT id FROM users WHERE auth_provider = ? AND provider_id = ? LIMIT 1
      `).bind(provider, providerId).first() as { id: number } | null;

      if (!user) {
        return false;
      }

      // Delete user (cascade should handle related data)
      const result = await this.db.prepare(`
        DELETE FROM users WHERE auth_provider = ? AND provider_id = ?
      `).bind(provider, providerId).run();

      return result.success;
    } catch (error) {
      console.error('Error deleting user by provider:', error);
      throw new Error('Failed to delete user');
    }
  }

  async getUserStats(): Promise<{ total: number; verified: number }> {
    try {
      const totalResult = await this.db.prepare(`
        SELECT COUNT(*) as count FROM users
      `).first() as { count: number } | null;

      const verifiedResult = await this.db.prepare(`
        SELECT COUNT(*) as count FROM users WHERE email_verified = 1 OR phone_verified = 1
      `).first() as { count: number } | null;

      return {
        total: totalResult?.count || 0,
        verified: verifiedResult?.count || 0
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw new Error('Failed to get user statistics');
    }
  }

  // Additional methods needed by index.ts
  async getAllUsers(page: number = 1, limit: number = 20): Promise<User[]> {
    try {
      const offset = (page - 1) * limit;
      const result = await this.db.prepare(`
        SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?
      `).bind(limit, offset).all() as { results: User[] };

      return result.results || [];
    } catch (error) {
      console.error('Error getting all users:', error);
      throw new Error('Failed to retrieve users');
    }
  }

  async getUserStatistics(): Promise<any> {
    return this.getUserStats();
  }
}