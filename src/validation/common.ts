// Common validation utilities

export function validateHashId(hashId: string): boolean {
  // HashId should be alphanumeric, 6+ characters (based on Hashids config)
  return /^[a-zA-Z0-9]{6,20}$/.test(hashId);
}

export function validateLockId(lockId: unknown): boolean {
  const id = Number(lockId);
  return Number.isInteger(id) && id > 0 && id <= 2147483647; // Max 32-bit int
}

export function validateCount(count: unknown): boolean {
  const num = Number(count);
  return Number.isInteger(num) && num > 0 && num <= 1000;
}

export function validateUserId(userId: unknown): boolean {
  const id = Number(userId);
  return Number.isInteger(id) && id > 0 && id <= 2147483647;
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

export function validatePhoneNumber(phone: string): boolean {
  // International phone number format starting with +
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
}

export function validateVerificationCode(code: string): boolean {
  // 6-digit numeric code
  return /^\d{6}$/.test(code);
}

export function validateStringInput(input: string, maxLength: number = 255): boolean {
  return typeof input === 'string' && input.length > 0 && input.length <= maxLength;
}

export function validateOptionalString(input?: string, maxLength: number = 255): boolean {
  if (input === undefined || input === null) return true;
  return typeof input === 'string' && input.length <= maxLength;
}

export function validateBooleanInput(input: unknown): boolean {
  return typeof input === 'boolean';
}

export function validateDateString(dateStr: string): boolean {
  const date = new Date(dateStr);
  return !isNaN(date.getTime()) && dateStr === date.toISOString().split('T')[0];
}

export function validateApiKey(providedKey: string, expectedKey: string): boolean {
  return providedKey === expectedKey && providedKey.length > 0;
}