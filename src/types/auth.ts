// Authentication models for custom auth system
export interface User {
  id: number;
  email?: string;
  phone_number?: string;
  auth_provider: 'email' | 'phone' | 'google' | 'apple';
  provider_id?: string;
  name?: string;
  email_verified: boolean;
  phone_verified: boolean;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
}

export interface RefreshToken {
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
  phone_number?: string;
  auth_provider: 'email' | 'phone' | 'google' | 'apple';
  provider_id?: string;
  name?: string;
  email_verified?: boolean;
  phone_verified?: boolean;
}