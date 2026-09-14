import Fastify from 'fastify';

import { overPrihlaseni } from './auth.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { synchronizuj } from './helios/sync.js';
import { synchronizujZrcadla } from './helios/zrcadla.js';
import { zakazkyRoutes } from './routes/zakazky.js';

const server = Fastify({
  logger: { level: 'info' },
  // Za reverzní proxy (IIS na RENDCAPPu) je potřeba věřit hlavičkám,
  // jinak je v logu jako klient pořád localhost.
  trustProxy: true,
});

// Kontrola pro monitoring - schválně bez přihlášení, ať jde zvenčí poznat,
// že služba žije, aniž by se kvůli tomu vydával token.
server.get('/health', async () => {
  const posledni = await prisma.synchronizace.findFirst({
    orderBy: { zacatekAt: 'desc' },
  });
  return {
    stav: 'ok',
    posledniSynchronizace: posledni?.konecAt ?? null,
    chybaSynchronizace: posledni?.chyba ?? null,
  };
});

await server.register(
  async (chranene) => {
    chranene.addHook('preHandler', overPrihlaseni);
    await chranene.register(zakazkyRoutes);
  },
  { prefix: '/api' },
);

/**
 * Synchronizace běží v intervalu z konfigurace. Nespouští se přesně na
 * začátku, ať se při restartu neseběhne s ostatními službami na serveru.
 */
function naplanujSynchronizaci(): NodeJS.Timeout {
  const interval = config.SYNC_INTERVAL_SECONDS * 1000;
  return setInterval(() => {
    synchronizuj().catch((chyba) => {
      // Výpadek Heliosu není důvod shodit službu - aplikace zatím ukazuje
      // poslední známý stav, což je lepší než prázdná obrazovka.
      server.log.error({ chyba }, 'Synchronizace z Heliosu selhala');
    });
  }, interval);
}

const casovac = naplanujSynchronizaci();

/**
 * Plná synchronizace vozidel, zákazníků, modelů a kontaktů jednou za noc.
 *
 * Kontroluje se každých deset minut, jestli už je ta hodina a jestli dnes
 * ještě neběžela - ne přesný časovač na tři hodiny ráno. Ten by po restartu
 * služby v noci běh přeskočil, nebo naopak spustil dvakrát.
 *
 * Nové záznamy na tenhle běh nečekají, ty doplňuje synchronizace zakázek.
 */
let zrcadlaDneBezela: string | null = null;
let zrcadlaBezi = false;

function naplanujZrcadla(): NodeJS.Timeout {
  return setInterval(() => {
    const ted = new Date();
    const den = ted.toDateString();
    if (ted.getHours() !== config.ZRCADLA_HODINA) return;
    if (zrcadlaDneBezela === den || zrcadlaBezi) return;

    zrcadlaBezi = true;
    zrcadlaDneBezela = den;
    const zacatek = Date.now();

    synchronizujZrcadla()
      .then((pocty) => {
        server.log.info(
          { ...pocty, sekund: Math.round((Date.now() - zacatek) / 1000) },
          'Noční synchronizace vozidel a zákazníků hotová',
        );
      })
      .catch((chyba) => {
        server.log.error({ chyba }, 'Noční synchronizace vozidel a zákazníků selhala');
      })
      .finally(() => {
        zrcadlaBezi = false;
      });
  }, 10 * 60 * 1000);
}

const casovacZrcadel = naplanujZrcadla();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearInterval(casovac);
    clearInterval(casovacZrcadel);
    void (async () => {
      await server.close();
      await prisma.$disconnect();
      process.exit(0);
    })();
  });
}

await server.listen({ port: config.PORT, host: config.HOST });

// První běh až po nastartování, ať služba odpovídá i když Helios zlobí.
synchronizuj().catch((chyba) => {
  server.log.error({ chyba }, 'První synchronizace z Heliosu selhala');
});
