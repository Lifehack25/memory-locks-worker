// Authentication models for custom auth system
export interface User {
  id: number;
  email?: string;
  PhoneNumber?: string;
  AuthProvider: 'email' | 'phone' | 'google' | 'apple';
  ProviderId?: string;
  name?: string;
  EmailVerified: boolean;
  PhoneVerified: boolean;
  CreatedAt: string;
  UpdatedAt: string;
  LastLoginAt?: string;
}

export interface RefreshToken {
  id: number;
  UserId: number;
  TokenHash: string;
  ExpiresAt: string;
  CreatedAt: string;
  LastUsedAt?: string;
  DeviceInfo?: string;
  IsRevoked: boolean;
}

// JWT token payload interface
export interface JWTPayload {
  sub: string; // user_id
  email?: string;
  name?: string;
  iat: number;
  exp: number;
  iss: string;
}

// Authentication request/response interfaces
export interface AuthRequest {
  identifier: string; // email or phone
  type: 'email' | 'phone';
}

export interface VerifyCodeRequest {
  identifier: string;
  code: string;
  type: 'email' | 'phone';
}

export interface SocialAuthRequest {
  provider: 'google' | 'apple';
  token: string; // ID token from provider
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: number;
    email?: string;
    name?: string;
  };
}

// User creation request for admin endpoints
export interface CreateUserRequest {
  email?: string;
  PhoneNumber?: string;
  AuthProvider: 'email' | 'phone' | 'google' | 'apple';
  ProviderId?: string;
  name?: string;
  EmailVerified?: boolean;
  PhoneVerified?: boolean;
}