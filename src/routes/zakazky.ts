import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { config } from "../config.js";
import { prisma } from "../db.js";
import { jePlatnyPosun, STAVY, type Stav } from "../domain/stav.js";
import {
  nactiTypyZakazek,
  typProApi,
  type TypyZakazek,
} from "../domain/typy.js";
import { pobockaZUtvaru, utvarProApi } from "../domain/utvar.js";
import { synchronizujNaVyzadani } from "../helios/sync.js";

const sVazbami = {
  dilensky: true,
  poznamky: { orderBy: { vytvorenoAt: "desc" } },
} as const;

type ZakazkaSVazbami = Prisma.HeliosZakazkaGetPayload<{
  include: typeof sVazbami;
}>;

/** Tvar odpovědi je daný kontraktem v docs/API.md mobilní aplikace. */
function doOdpovedi(zakazka: ZakazkaSVazbami, typy: TypyZakazek) {
  return {
    id: zakazka.cisloZakazky,
    licensePlate: zakazka.spz ?? "",
    model: zakazka.model ?? "",
    customerName: zakazka.zakaznik ?? "",
    status: zakazka.dilensky?.stav ?? "received",
    branch: pobockaZUtvaru(zakazka.utvarKod),
    department: utvarProApi(zakazka.utvarKod, zakazka.utvarNazev),
    orderType: typProApi(zakazka.radaReference, typy),
    receivedAt: zakazka.datumPrijeti?.toISOString().slice(0, 19) ?? null,
    dueAt: zakazka.terminDokonceni?.toISOString().slice(0, 19) ?? null,
    vin: zakazka.vin ?? "",
    mechanicName: null,
    serviceAdvisorName: null,
    bay: zakazka.dilensky?.stani ?? null,
    heliosStatus: zakazka.stavRealNazev,
    isActive: zakazka.jeAktivni,
    closedAt: zakazka.uzavrenaAt?.toISOString().slice(0, 19) ?? null,
    notes: zakazka.poznamky.map((p) => ({
      id: p.id,
      text: p.text,
      author: p.autor,
      createdAt: p.vytvorenoAt.toISOString().slice(0, 19),
    })),
    // Úkony (závady) se z Heliosu zatím netahají - aplikace tuhle sekci
    // při prázdném seznamu nezobrazí.
    workItems: [],
  };
}

async function nactiJednu(cisloZakazky: string) {
  return prisma.heliosZakazka.findUnique({
    where: { cisloZakazky },
    include: sVazbami,
  });
}

const nenalezena = {
  error: { code: "not_found", message: "Zakázka nebyla nalezena." },
};

export async function zakazkyRoutes(server: FastifyInstance): Promise<void> {
  /**
   * Seznam pro telefon: **jen rozdělané zakázky** z posledních měsíců
   * (`SEZNAM_MESICU`). Uzavřené se sem schválně neposílají - je jich
   * desítky tisíc a aplikace si seznam drží v paměti, aby filtrovala
   * a hledala bez čekání. Starší se dohledávají přes `/orders/search`.
   */
  server.get("/orders", async () => {
    const od = new Date();
    od.setMonth(od.getMonth() - config.SEZNAM_MESICU);

    const zakazky = await prisma.heliosZakazka.findMany({
      where: { jeAktivni: true, datumPrijeti: { gte: od } },
      include: sVazbami,
      orderBy: { terminDokonceni: "asc" },
    });
    const typy = await nactiTypyZakazek();
    return zakazky.map((zakazka) => doOdpovedi(zakazka, typy));
  });

  /**
   * Hledání napříč celým archivem, včetně uzavřených zakázek.
   *
   * Slouží k dohledání staré zakázky - typicky kvůli fotodokumentaci,
   * podle SPZ nebo VIN načteného fotoaparátem. Hledá se na serveru, takže
   * na velikosti archivu nezáleží; přenáší se jen nalezené.
   */
  server.get<{ Querystring: { q?: string } }>(
    "/orders/search",
    async (request, reply) => {
      const dotaz = (request.query.q ?? "").trim();
      if (dotaz.length < 3) {
        return reply.code(400).send({
          error: {
            code: "bad_request",
            message: "Zadejte alespoň tři znaky.",
          },
        });
      }

      // Mezery ve VIN a SPZ se z OCR čtou nespolehlivě, tak je ignorujeme.
      const bezMezer = dotaz.replace(/\s+/g, "");

      const zakazky = await prisma.heliosZakazka.findMany({
        where: {
          OR: [
            { cisloZakazky: { contains: bezMezer } },
            { vin: { contains: bezMezer } },
            { spz: { contains: dotaz } },
            { spz: { contains: bezMezer } },
            { zakaznik: { contains: dotaz } },
          ],
        },
        include: sVazbami,
        orderBy: { datumPrijeti: "desc" },
        take: config.HLEDANI_LIMIT,
      });

      const typy = await nactiTypyZakazek();
      return zakazky.map((zakazka) => doOdpovedi(zakazka, typy));
    },
  );

  server.get<{ Params: { id: string } }>(
    "/orders/:id",
    async (request, reply) => {
      const zakazka = await nactiJednu(request.params.id);
      if (!zakazka) return reply.code(404).send(nenalezena);
      return doOdpovedi(zakazka, await nactiTypyZakazek());
    },
  );

  const posunSchema = z.object({ status: z.enum(STAVY) });

  server.patch<{ Params: { id: string } }>(
    "/orders/:id",
    async (request, reply) => {
      const telo = posunSchema.safeParse(request.body);
      if (!telo.success) {
        return reply.code(400).send({
          error: { code: "bad_request", message: "Neznámý stav zakázky." },
        });
      }

      const zakazka = await nactiJednu(request.params.id);
      if (!zakazka) return reply.code(404).send(nenalezena);

      const soucasny = (zakazka.dilensky?.stav ?? "received") as Stav;
      if (!jePlatnyPosun(soucasny, telo.data.status)) {
        // Aplikace nabízí jen následující krok, ale spoléhat se na to nedá.
        return reply.code(409).send({
          error: {
            code: "invalid_transition",
            message: "Stav lze posunout jen o jeden krok dopředu.",
          },
        });
      }

      const kdo =
        request.zamestnanec?.jmeno ?? request.zamestnanec?.email ?? null;
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
      return doOdpovedi(aktualni, await nactiTypyZakazek());
    },
  );

  const poznamkaSchema = z.object({
    text: z.string().trim().min(1).max(2000),
    author: z.string().optional(),
  });

  server.post<{ Params: { id: string } }>(
    "/orders/:id/notes",
    async (request, reply) => {
      const telo = poznamkaSchema.safeParse(request.body);
      if (!telo.success) {
        return reply.code(400).send({
          error: {
            code: "bad_request",
            message: "Poznámka je prázdná nebo příliš dlouhá.",
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
            "Neznámý",
          autorUid: request.zamestnanec?.uid ?? null,
        },
      });

      const aktualni = await prisma.heliosZakazka.findUniqueOrThrow({
        where: { cisloZakazky: zakazka.cisloZakazky },
        include: sVazbami,
      });
      return doOdpovedi(aktualni, await nactiTypyZakazek());
    },
  );

  /** Ruční dotažení z Heliosu, omezené na jedno volání za minutu. */
  server.post("/sync", async (_request, reply) => {
    const vysledek = await synchronizujNaVyzadani();
    if (!vysledek.spustena) {
      return reply.code(429).send({
        error: {
          code: "too_many_requests",
          message: `Data se právě obnovovala, zkuste to za ${vysledek.zaSekund} s.`,
        },
      });
    }
    return { pocet: vysledek.pocet };
  });
}
