import { z } from 'zod';
import { insertMtrSchema, mtrs, systemLogs, mtrItems } from './schema';
export type { UpdateMtrRequest, BatchProcessRequest } from './schema';

// Shared Error Schemas
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// API Contract
export const api = {
  mtrs: {
    list: {
      method: 'GET' as const,
      path: '/api/mtrs',
      input: z.object({
        page: z.coerce.number().optional(),
        limit: z.coerce.number().optional(),
        status: z.enum(["PENDENTE", "VALIDO", "ERRO", "ENVIADO"]).optional(),
        search: z.string().optional(),
      }).optional(),
      responses: {
        200: z.object({
          data: z.array(z.custom<typeof mtrs.$inferSelect & { items: typeof mtrItems.$inferSelect[] }>()),
          total: z.number(),
          page: z.number(),
          totalPages: z.number()
        }),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/mtrs/:id',
      responses: {
        200: z.custom<typeof mtrs.$inferSelect & { items: typeof mtrItems.$inferSelect[] }>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/mtrs/:id',
      input: insertMtrSchema.partial().extend({
        items: z.array(z.object({
          id: z.number().optional(),
          quantity: z.number().or(z.string()).optional(),
          unit: z.string().optional(),
        })).optional()
      }),
      responses: {
        200: z.custom<typeof mtrs.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    validate: {
      method: 'POST' as const,
      path: '/api/mtrs/validate', // Validates all or specific IDs
      input: z.object({
        ids: z.array(z.number()).optional(), // If empty, validates all PENDING
      }),
      responses: {
        200: z.object({
          processed: z.number(),
          valid: z.number(),
          errors: z.number(),
        }),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/mtrs/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    }
  },
  upload: {
    import: {
      method: 'POST' as const,
      path: '/api/upload/sinir',
      // Input is FormData (file), not strictly typed here but handled in route
      responses: {
        200: z.object({
          message: z.string(),
          imported: z.number(),
          skipped: z.number(),
          errors: z.array(z.string()),
        }),
      },
    },
  },
  batch: {
    send: {
      method: 'POST' as const,
      path: '/api/batch/send',
      input: z.object({
        mtrIds: z.array(z.number()),
        mode: z.enum(['SIMULATED', 'REAL']),
      }),
      responses: {
        200: z.object({
          jobId: z.string(),
          message: z.string(),
        }),
      },
    },
  },
  logs: {
    list: {
      method: 'GET' as const,
      path: '/api/logs',
      input: z.object({
        limit: z.coerce.number().optional(),
        level: z.enum(['INFO', 'WARN', 'ERROR']).optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof systemLogs.$inferSelect>()),
      },
    },
    stats: {
      method: 'GET' as const,
      path: '/api/logs/stats',
      responses: {
        200: z.object({
          total: z.number(),
          errors: z.number(),
          warnings: z.number(),
        }),
      },
    },
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type MtrListResponse = z.infer<typeof api.mtrs.list.responses[200]>;
export type MtrDetailResponse = z.infer<typeof api.mtrs.get.responses[200]>;
