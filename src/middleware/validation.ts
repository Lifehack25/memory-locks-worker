import { Context } from 'hono';
import { z, ZodError } from 'zod';
import { Env } from '../types/common';

// Extend Context with custom properties
interface ExtendedContext extends Context {
  set(key: string, value: any): void;
  get(key: string): any;
}

// Generic validation middleware factory
export class ValidationMiddleware {
  
  // Validate request body
  static validateBody<T extends z.ZodSchema>(schema: T) {
    return async (c: any, next: () => Promise<void>) => {
      let body: any;
      try {
        body = await c.req.json();
        
        // DEBUG: Log the incoming request body for Apple user creation
        console.log('🔍 VALIDATION DEBUG - Incoming request body:', JSON.stringify(body, null, 2));
        
        const validatedData = schema.parse(body);
        
        // DEBUG: Log successful validation
        console.log('✅ VALIDATION DEBUG - Successfully validated:', JSON.stringify(validatedData, null, 2));
        
        // Store validated data in context for use in handlers
        c.set('validatedBody', validatedData);
        await next();
      } catch (error) {
        if (error instanceof ZodError) {
          // DEBUG: Log detailed validation errors
          console.log('❌ VALIDATION DEBUG - Validation failed:', JSON.stringify((error as any).errors, null, 2));
          console.log('❌ VALIDATION DEBUG - Original body:', JSON.stringify(body, null, 2));
          
          return c.json({
            error: 'Validation failed',
            success: false,
            details: (error as any).errors?.map((err: any) => ({
              field: err.path.join('.'),
              message: err.message,
              code: err.code,
            }))
          }, 400);
        }
        
        return c.json({
          error: 'Invalid request body',
          success: false
        }, 400);
      }
    };
  }

  // Validate path parameters
  static validateParams<T extends z.ZodSchema>(schema: T) {
    return async (c: any, next: () => Promise<void>) => {
      try {
        const params = c.req.param();
        const validatedParams = schema.parse(params);
        
        // Store validated params in context
        c.set('validatedParams', validatedParams);
        await next();
      } catch (error) {
        if (error instanceof ZodError) {
          return c.json({
            error: 'Invalid path parameters',
            success: false,
            details: (error as any).errors?.map((err: any) => ({
              field: err.path.join('.'),
              message: err.message,
              code: err.code,
            }))
          }, 400);
        }
        
        return c.json({
          error: 'Invalid path parameters',
          success: false
        }, 400);
      }
    };
  }

  // Validate query parameters
  static validateQuery<T extends z.ZodSchema>(schema: T) {
    return async (c: any, next: () => Promise<void>) => {
      try {
        const query = c.req.query();
        const validatedQuery = schema.parse(query);
        
        // Store validated query in context
        c.set('validatedQuery', validatedQuery);
        await next();
      } catch (error) {
        if (error instanceof ZodError) {
          return c.json({
            error: 'Invalid query parameters',
            success: false,
            details: (error as any).errors?.map((err: any) => ({
              field: err.path.join('.'),
              message: err.message,
              code: err.code,
            }))
          }, 400);
        }
        
        return c.json({
          error: 'Invalid query parameters',
          success: false
        }, 400);
      }
    };
  }

  // Validate all three: body, params, and query
  static validate<B extends z.ZodSchema, P extends z.ZodSchema, Q extends z.ZodSchema>(
    bodySchema?: B,
    paramsSchema?: P, 
    querySchema?: Q
  ) {
    return async (c: any, next: () => Promise<void>) => {
      const errors: Array<{ field: string; message: string; code: string }> = [];

      // Validate body if schema provided
      if (bodySchema) {
        try {
          const body = await c.req.json().catch(() => ({}));
          const validatedBody = bodySchema.parse(body);
          c.set('validatedBody', validatedBody);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push(...(error as any).errors?.map((err: any) => ({
              field: `body.${err.path.join('.')}`,
              message: err.message,
              code: err.code,
            })));
          }
        }
      }

      // Validate params if schema provided
      if (paramsSchema) {
        try {
          const params = c.req.param();
          const validatedParams = paramsSchema.parse(params);
          c.set('validatedParams', validatedParams);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push(...(error as any).errors?.map((err: any) => ({
              field: `params.${err.path.join('.')}`,
              message: err.message,
              code: err.code,
            })));
          }
        }
      }

      // Validate query if schema provided
      if (querySchema) {
        try {
          const query = c.req.query();
          const validatedQuery = querySchema.parse(query);
          c.set('validatedQuery', validatedQuery);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push(...(error as any).errors?.map((err: any) => ({
              field: `query.${err.path.join('.')}`,
              message: err.message,
              code: err.code,
            })));
          }
        }
      }

      if (errors.length > 0) {
        return c.json({
          error: 'Validation failed',
          success: false,
          details: errors
        }, 400);
      }

      await next();
    };
  }

  // Helper functions to get validated data from context
  static getValidatedBody<T>(c: any): T {
    return c.get('validatedBody') as T;
  }

  static getValidatedParams<T>(c: any): T {
    return c.get('validatedParams') as T;
  }

  static getValidatedQuery<T>(c: any): T {
    return c.get('validatedQuery') as T;
  }

  // Direct validation functions (for use without middleware)
  static async validateBodyDirect<T extends z.ZodSchema>(
    c: any,
    schema: T
  ): Promise<{ success: true; data: z.infer<T> } | { success: false; error: any }> {
    try {
      const body = await c.req.json().catch(() => ({}));
      const validatedData = schema.parse(body);
      return { success: true, data: validatedData };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            message: 'Validation failed',
            details: (error as any).errors?.map((err: any) => ({
              field: err.path.join('.'),
              message: err.message,
              code: err.code,
            }))
          }
        };
      }
      return {
        success: false,
        error: { message: 'Invalid request body' }
      };
    }
  }

  static validateParamsDirect<T extends z.ZodSchema>(
    c: any,
    schema: T
  ): { success: true; data: z.infer<T> } | { success: false; error: any } {
    try {
      const params = c.req.param();
      const validatedData = schema.parse(params);
      return { success: true, data: validatedData };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            message: 'Invalid path parameters',
            details: (error as any).errors?.map((err: any) => ({
              field: err.path.join('.'),
              message: err.message,
              code: err.code,
            }))
          }
        };
      }
      return {
        success: false,
        error: { message: 'Invalid path parameters' }
      };
    }
  }

  static validateQueryDirect<T extends z.ZodSchema>(
    c: any,
    schema: T
  ): { success: true; data: z.infer<T> } | { success: false; error: any } {
    try {
      const query = c.req.query();
      const validatedData = schema.parse(query);
      return { success: true, data: validatedData };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            message: 'Invalid query parameters',
            details: (error as any).errors?.map((err: any) => ({
              field: err.path.join('.'),
              message: err.message,
              code: err.code,
            }))
          }
        };
      }
      return {
        success: false,
        error: { message: 'Invalid query parameters' }
      };
    }
  }

  // Sanitization helper
  static sanitize<T extends z.ZodSchema>(schema: T, data: unknown): z.infer<T> | null {
    try {
      return schema.parse(data);
    } catch (error) {
      console.warn('Data sanitization failed:', error);
      return null;
    }
  }
}