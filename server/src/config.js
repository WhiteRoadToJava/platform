import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().startsWith('mongodb://', 'MONGODB_URI must start with mongodb://'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  TRAEFIK_PROVIDER_TOKEN: z.string().min(32, 'TRAEFIK_PROVIDER_TOKEN must be at least 32 characters'),
  PLATFORM_MASTER_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'PLATFORM_MASTER_KEY must be 64 hex characters (openssl rand -hex 32)'),
  APP_MONGODB_HOST: z.string().default('mongodb:27017'),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid configuration:');
  for (const issue of result.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = result.data;