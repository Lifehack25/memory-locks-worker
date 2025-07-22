// Input sanitization utilities

export function sanitizeStringInput(input: string): string {
  // Remove potential harmful characters and trim
  return input.replace(/[<>'"&]/g, '').trim();
}

export function sanitizeOptionalString(input?: string): string | undefined {
  if (!input) return undefined;
  return sanitizeStringInput(input);
}

export function sanitizeLockName(lockName?: string): string | undefined {
  if (!lockName) return undefined;
  return sanitizeStringInput(lockName).substring(0, 100);
}

export function sanitizeAlbumTitle(albumTitle?: string): string | undefined {
  if (!albumTitle) return undefined;
  return sanitizeStringInput(albumTitle).substring(0, 200);
}

export function sanitizeUserName(name?: string): string | undefined {
  if (!name) return undefined;
  return sanitizeStringInput(name).substring(0, 100);
}

export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function sanitizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except +
  return phone.replace(/[^\d+]/g, '').trim();
}