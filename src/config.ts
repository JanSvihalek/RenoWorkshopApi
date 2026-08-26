import { z } from 'zod';

/**
 * Konfigurace z proměnných prostředí. Ověřuje se při startu, ať služba
 * spadne hned a srozumitelně, ne až za pět minut při první synchronizaci.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),

  SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(300),

  // Kolik měsíců zpět posílat do telefonu. Seznam drží jen rozdělané
  // zakázky z tohohle okna; starší se dohledávají hledáním, v databázi
  // zůstávají napořád. Změna se projeví restartem služby, ne novým buildem.
  SEZNAM_MESICU: z.coerce.number().int().min(1).max(60).default(3),

  // Kolik zakázek nejvýš vrátí hledání v archivu.
  HLEDANI_LIMIT: z.coerce.number().int().min(10).max(500).default(100),

  FIREBASE_PROJECT_ID: z.string().min(1),

  PORT: z.coerce.number().int().default(8092),
  // Jen zevnitř serveru; zvenčí se chodí přes reverzní proxy v IIS.
  HOST: z.string().default('127.0.0.1'),
});

const vysledek = schema.safeParse(process.env);

if (!vysledek.success) {
  const chybejici = vysledek.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Chybí nebo je špatně nastavená konfigurace:\n${chybejici}`);
}

export const config = vysledek.data;
