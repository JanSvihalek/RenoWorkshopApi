import Fastify from 'fastify';

import { overPrihlaseni } from './auth.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { zavriHelios } from './helios/klient.js';
import { synchronizuj } from './helios/sync.js';
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

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearInterval(casovac);
    void (async () => {
      await server.close();
      await zavriHelios();
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
