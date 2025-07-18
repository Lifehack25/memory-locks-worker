// Minimal Worker Types - only what we actually use
// This replaces the massive auto-generated worker-configuration.d.ts

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
  }
}

interface Env extends Cloudflare.Env {}

// Console API (essential for logging)
declare var console: {
  log(...args: any[]): void;
  error(...args: any[]): void;
  warn(...args: any[]): void;
  info(...args: any[]): void;
};

// D1 Database Types (only what we use)
declare interface D1Database {
  prepare(statement: string): D1PreparedStatement;
}

declare interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = any>(): Promise<T | null>;
  all<T = any>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<void>>;
}

declare interface D1Result<T = any> {
  results?: T[];
  success: boolean;
  error?: string;
  changes?: number;
}