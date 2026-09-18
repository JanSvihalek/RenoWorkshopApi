import type { FastifyInstance } from "fastify";

import { config } from "./config.js";
import { prisma } from "./db.js";
import { mistniCas } from "./domain/cas.js";
import { chybaZOdpovedi, zaznamPristupu } from "./domain/log-pristupu.js";

declare module "fastify" {
  interface FastifyRequest {
    chybaOdpovedi?: string | null;
  }
}

/** Nejdřív za deset minut znovu - ať chybějící tabulka nezaplaví log. */
const PAUZA_VAROVANI_MS = 10 * 60 * 1000;
let posledniVarovani = 0;

/**
 * Zapisuje každý požadavek na chráněné routy do `log_pristupu`.
 *
 * Zápis běží až po odeslání odpovědi a nečeká se na něj - log nesmí
 * zpomalit aplikaci ani ji shodit. Když zápis selže (tabulka ještě není
 * založená, databáze mlčí), služba jede dál a varování je v konzoli.
 */
export function zaznamenavejPristupy(server: FastifyInstance): void {
  server.addHook("onSend", async (request, reply, payload) => {
    if (reply.statusCode >= 400) {
      request.chybaOdpovedi = chybaZOdpovedi(payload);
    }
    return payload;
  });

  server.addHook("onResponse", async (request, reply) => {
    const zaznam = zaznamPristupu({
      metoda: request.method,
      cesta: request.routeOptions.url ?? request.url,
      parametry: request.params,
      stav: reply.statusCode,
      trvaniMs: reply.elapsedTime,
      email: request.zamestnanec?.email ?? null,
      uid: request.zamestnanec?.uid ?? null,
      ip: request.ip ?? null,
      chyba: request.chybaOdpovedi ?? null,
    });

    prisma.zaznamPristupu.create({ data: zaznam }).catch((chyba: unknown) => {
      const ted = Date.now();
      if (ted - posledniVarovani < PAUZA_VAROVANI_MS) return;
      posledniVarovani = ted;
      request.log.warn(
        { chyba },
        "Přístup se nepodařilo zapsat do log_pristupu (je tabulka založená?)",
      );
    });
  });
}

/** Smaže záznamy starší než `LOG_UCHOVANI_DNI`. Volá noční běh. */
export async function smazStarePristupy(): Promise<number> {
  // V tabulce je místní čas (viz domain/cas.ts), tak i hranice.
  const hranice = mistniCas(
    new Date(Date.now() - config.LOG_UCHOVANI_DNI * 24 * 60 * 60 * 1000),
  );
  const { count } = await prisma.zaznamPristupu.deleteMany({
    where: { cas: { lt: hranice } },
  });
  return count;
}
