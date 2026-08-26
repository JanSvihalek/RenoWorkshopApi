import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma } from '../db.js';
import { jePlatnyPosun, STAVY, type Stav } from '../domain/stav.js';
import { pobockaZUtvaru, utvarProApi } from '../domain/utvar.js';
import { synchronizujNaVyzadani } from '../helios/sync.js';

const sVazbami = {
  dilensky: true,
  poznamky: { orderBy: { vytvorenoAt: 'desc' } },
  ukony: { orderBy: { nazev: 'asc' } },
} as const;

type ZakazkaSVazbami = Prisma.HeliosZakazkaGetPayload<{
  include: typeof sVazbami;
}>;

/** Tvar odpovědi je daný kontraktem v docs/API.md mobilní aplikace. */
function doOdpovedi(zakazka: ZakazkaSVazbami) {
  return {
    id: zakazka.cisloZakazky,
    licensePlate: zakazka.spz ?? '',
    model: zakazka.model ?? '',
    customerName: zakazka.zakaznik ?? '',
    status: zakazka.dilensky?.stav ?? 'received',
    branch: pobockaZUtvaru(zakazka.utvarKod),
    department: utvarProApi(zakazka.utvarKod, zakazka.utvarNazev),
    receivedAt: zakazka.datumPrijeti?.toISOString().slice(0, 19) ?? null,
    dueAt: zakazka.terminDokonceni?.toISOString().slice(0, 19) ?? null,
    vin: zakazka.vin ?? '',
    mechanicName: null,
    serviceAdvisorName: null,
    bay: zakazka.dilensky?.stani ?? null,
    heliosStatus: zakazka.stavRealNazev,
    notes: zakazka.poznamky.map((p) => ({
      id: p.id,
      text: p.text,
      author: p.autor,
      createdAt: p.vytvorenoAt.toISOString().slice(0, 19),
    })),
    workItems: zakazka.ukony.map((u) => ({
      id: u.id,
      title: u.nazev,
      isDone: u.hotovo,
      estimatedHours: u.normohodiny ? Number(u.normohodiny) : null,
    })),
  };
}

async function nactiJednu(cisloZakazky: string) {
  return prisma.heliosZakazka.findUnique({
    where: { cisloZakazky },
    include: sVazbami,
  });
}

const nenalezena = {
  error: { code: 'not_found', message: 'Zakázka nebyla nalezena.' },
};

export async function zakazkyRoutes(server: FastifyInstance): Promise<void> {
  server.get('/orders', async () => {
    const zakazky = await prisma.heliosZakazka.findMany({
      include: sVazbami,
      orderBy: { terminDokonceni: 'asc' },
    });
    return zakazky.map(doOdpovedi);
  });

  server.get<{ Params: { id: string } }>('/orders/:id', async (request, reply) => {
    const zakazka = await nactiJednu(request.params.id);
    if (!zakazka) return reply.code(404).send(nenalezena);
    return doOdpovedi(zakazka);
  });

  const posunSchema = z.object({ status: z.enum(STAVY) });

  server.patch<{ Params: { id: string } }>('/orders/:id', async (request, reply) => {
    const telo = posunSchema.safeParse(request.body);
    if (!telo.success) {
      return reply.code(400).send({
        error: { code: 'bad_request', message: 'Neznámý stav zakázky.' },
      });
    }

    const zakazka = await nactiJednu(request.params.id);
    if (!zakazka) return reply.code(404).send(nenalezena);

    const soucasny = (zakazka.dilensky?.stav ?? 'received') as Stav;
    if (!jePlatnyPosun(soucasny, telo.data.status)) {
      // Aplikace nabízí jen následující krok, ale spoléhat se na to nedá.
      return reply.code(409).send({
        error: {
          code: 'invalid_transition',
          message: 'Stav lze posunout jen o jeden krok dopředu.',
        },
      });
    }

    const kdo = request.zamestnanec?.jmeno ?? request.zamestnanec?.email ?? null;
    await prisma.dilenskyStav.upsert({
      where: { cisloZakazky: zakazka.cisloZakazky },
      create: {
        cisloZakazky: zakazka.cisloZakazky,
        stav: telo.data.status,
        zmenenoKym: kdo,
        zmenenoUid: request.zamestnanec?.uid ?? null,
      },
      update: {
        stav: telo.data.status,
        zmenenoKym: kdo,
        zmenenoUid: request.zamestnanec?.uid ?? null,
      },
    });

    const aktualni = await prisma.heliosZakazka.findUniqueOrThrow({
      where: { cisloZakazky: zakazka.cisloZakazky },
      include: sVazbami,
    });
    return doOdpovedi(aktualni);
  });

  const poznamkaSchema = z.object({
    text: z.string().trim().min(1).max(2000),
    author: z.string().optional(),
  });

  server.post<{ Params: { id: string } }>('/orders/:id/notes', async (request, reply) => {
    const telo = poznamkaSchema.safeParse(request.body);
    if (!telo.success) {
      return reply.code(400).send({
        error: {
          code: 'bad_request',
          message: 'Poznámka je prázdná nebo příliš dlouhá.',
        },
      });
    }

    const zakazka = await nactiJednu(request.params.id);
    if (!zakazka) return reply.code(404).send(nenalezena);

    await prisma.poznamka.create({
      data: {
        cisloZakazky: zakazka.cisloZakazky,
        text: telo.data.text,
        // Autor z tokenu, ne z těla požadavku - tomu se věřit nedá.
        autor:
          request.zamestnanec?.jmeno ??
          request.zamestnanec?.email ??
          telo.data.author ??
          'Neznámý',
        autorUid: request.zamestnanec?.uid ?? null,
      },
    });

    const aktualni = await prisma.heliosZakazka.findUniqueOrThrow({
      where: { cisloZakazky: zakazka.cisloZakazky },
      include: sVazbami,
    });
    return doOdpovedi(aktualni);
  });

  const ukonSchema = z.object({ isDone: z.boolean() });

  server.patch<{ Params: { id: string; ukonId: string } }>(
    '/orders/:id/work-items/:ukonId',
    async (request, reply) => {
      const telo = ukonSchema.safeParse(request.body);
      if (!telo.success) {
        return reply.code(400).send({
          error: { code: 'bad_request', message: 'Očekává se pole isDone.' },
        });
      }

      const ukon = await prisma.heliosUkon.findUnique({
        where: { id: request.params.ukonId },
      });
      if (!ukon || ukon.cisloZakazky !== request.params.id) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Úkon nebyl nalezen.' },
        });
      }

      await prisma.heliosUkon.update({
        where: { id: ukon.id },
        data: { hotovo: telo.data.isDone },
      });

      const aktualni = await prisma.heliosZakazka.findUniqueOrThrow({
        where: { cisloZakazky: request.params.id },
        include: sVazbami,
      });
      return doOdpovedi(aktualni);
    },
  );

  /** Ruční dotažení z Heliosu, omezené na jedno volání za minutu. */
  server.post('/sync', async (_request, reply) => {
    const vysledek = await synchronizujNaVyzadani();
    if (!vysledek.spustena) {
      return reply.code(429).send({
        error: {
          code: 'too_many_requests',
          message: `Data se právě obnovovala, zkuste to za ${vysledek.zaSekund} s.`,
        },
      });
    }
    return { pocet: vysledek.pocet };
  });
}
