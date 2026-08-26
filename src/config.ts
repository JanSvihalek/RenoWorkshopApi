import { z } from 'zod';

/**
 * Konfigurace z proměnných prostředí. Ověřuje se při startu, ať služba
 * spadne hned a srozumitelně, ne až za pět minut při první synchronizaci.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),

  HELIOS_SERVER: z.string().min(1),
  HELIOS_DATABASE: z.string().min(1),
  HELIOS_USER: z.string().min(1),
  HELIOS_PASSWORD: z.string(),
  HELIOS_TRUST_CERT: z.enum(['true', 'false']).default('true'),

  SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(300),

  FIREBASE_PROJECT_ID: z.string().min(1),

  PORT: z.coerce.number().int().default(8081),
  HOST: z.string().default('0.0.0.0'),
});

const vysledek = schema.safeParse(process.env);

if (!vysledek.success) {
  const chybejici = vysledek.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Chybí nebo je špatně nastavená konfigurace:\n${chybejici}`);
}

export const config = {
  ...vysledek.data,
  heliosTrustCert: vysledek.data.HELIOS_TRUST_CERT === 'true',
};
