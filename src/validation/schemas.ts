import { z } from 'zod';

// Common validation schemas
export const HashIdSchema = z.string().regex(/^[a-zA-Z0-9]{6,20}$/, 'Invalid hash ID format');

export const PositiveIntSchema = z.number().int().positive().max(2147483647);

export const OptionalStringSchema = z.string().trim().max(255).optional();

export const RequiredStringSchema = z.string().trim().min(1).max(255);

// User-related schemas
export const EmailSchema = z.string().email().max(255);

export const PhoneSchema = z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid international phone number format');

export const UserIdSchema = PositiveIntSchema;

export const CreateUserSchema = z.object({
  email: EmailSchema.optional(),
  phone_number: PhoneSchema.optional(),
  auth_provider: z.enum(['email', 'phone', 'google', 'apple']).default('email'),
  provider_id: OptionalStringSchema,
  name: OptionalStringSchema.refine(val => !val || val.length <= 100, 'Name too long'),
  email_verified: z.boolean().default(false),
  phone_verified: z.boolean().default(false),
}).refine(data => {
  // For Apple/Google users, provider_id is sufficient
  if (data.auth_provider === 'apple' || data.auth_provider === 'google') {
    return !!data.provider_id && data.provider_id.length > 0;
  }
  // For email/phone users, require email or phone_number
  return !!(data.email && data.email.length > 0) || !!(data.phone_number && data.phone_number.length > 0);
}, {
  message: 'Either email, phone_number, or provider_id (for social auth) must be provided',
});

// Lock-related schemas
export const LockIdSchema = PositiveIntSchema;

export const LockNameSchema = z.string().trim().min(1).max(100).optional();

export const AlbumTitleSchema = z.string().trim().min(1).max(200).optional();

export const SealDateSchema = z.string().datetime().optional();

export const BulkLockGenerationSchema = z.object({
  count: z.number().int().min(1).max(1000),
  prefix: z.string().trim().min(1).max(20).optional(),
});

export const UpdateLockSchema = z.object({
  lockName: LockNameSchema,
  albumTitle: AlbumTitleSchema,
  sealDate: SealDateSchema,
  notifiedWhenScanned: z.boolean().optional(),
}).partial();

export const UpdateLockNameSchema = z.object({
  lockName: z.string().trim().min(1).max(100),
});

export const UpdateAlbumTitleSchema = z.object({
  albumTitle: z.string().trim().min(1).max(200),
});

export const UpdateOwnerSchema = z.object({
  userId: UserIdSchema.nullable(),
});

export const UpdateNotificationsSchema = z.object({
  notifiedWhenScanned: z.boolean(),
});

// Authentication schemas
export const AuthRequestSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
  type: z.enum(['email', 'phone']),
});

export const VerifyCodeSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
  type: z.enum(['email', 'phone']),
});

export const SocialAuthSchema = z.object({
  provider: z.enum(['google', 'apple']),
  token: z.string().min(10).max(10000), // JWT tokens are typically quite long
});

// Query parameter schemas
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const CountParamSchema = z.object({
  count: z.coerce.number().int().min(1).max(1000),
});

export const UserIdParamSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

export const LockIdParamSchema = z.object({
  lockId: z.coerce.number().int().positive(),
});

export const HashIdParamSchema = z.object({
  hashId: HashIdSchema,
});

export const ProviderParamSchema = z.object({
  provider: z.string().trim().min(1).max(50),
  providerId: z.string().trim().min(1).max(255),
});

// Response schemas (for documentation and type safety)
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const ErrorResponseSchema = z.object({
  error: z.string(),
  success: z.literal(false),
  code: z.string().optional(),
  details: z.any().optional(),
});

export const BulkGenerationResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  generated: z.number(),
  startId: z.number(),
  endId: z.number(),
});

// Media-related schemas
export const MediaTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']);

export const MediaObjectSchema = z.object({
  Id: PositiveIntSchema,
  LockId: PositiveIntSchema,
  CloudflareImageId: z.string().min(1).max(255),
  Url: z.string().url(),
  FileName: OptionalStringSchema,
  MediaType: MediaTypeSchema,
  IsProfilePicture: z.boolean(),
  CreatedAt: z.string().datetime(),
});

// Validation helper functions
export function validateHashId(hashId: unknown): string {
  return HashIdSchema.parse(hashId);
}

export function validateLockId(lockId: unknown): number {
  return LockIdSchema.parse(Number(lockId));
}

export function validateUserId(userId: unknown): number {
  return UserIdSchema.parse(Number(userId));
}

export function validateCount(count: unknown): number {
  return z.coerce.number().int().min(1).max(1000).parse(count);
}

// Sanitization schemas (remove harmful characters)
export const SanitizedStringSchema = z.string()
  .trim()
  .transform(val => val.replace(/[<>'"&]/g, ''));

export const SanitizedOptionalStringSchema = SanitizedStringSchema.optional();

// Advanced validation schemas
export const StrictEmailSchema = EmailSchema.refine(async (email) => {
  // Could add async email validation here (DNS checks, etc.)
  return email.length > 0;
});

export const DateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
}).refine(data => {
  if (data.startDate && data.endDate) {
    return new Date(data.startDate) <= new Date(data.endDate);
  }
  return true;
}, {
  message: 'Start date must be before end date',
});

// Export type inference helpers
export type CreateUserRequest = z.infer<typeof CreateUserSchema>;
export type UpdateLockRequest = z.infer<typeof UpdateLockSchema>;
export type BulkLockGenerationRequest = z.infer<typeof BulkLockGenerationSchema>;
export type AuthRequest = z.infer<typeof AuthRequestSchema>;
export type VerifyCodeRequest = z.infer<typeof VerifyCodeSchema>;
export type SocialAuthRequest = z.infer<typeof SocialAuthSchema>;
export type ApiResponse = z.infer<typeof ApiResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;