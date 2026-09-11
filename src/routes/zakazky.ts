import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { config } from "../config.js";
import { prisma } from "../db.js";
import {
  nactiTypyZakazek,
  typProApi,
  type TypyZakazek,
} from "../domain/typy.js";
import { pobockaZUtvaru, utvarProApi } from "../domain/utvar.js";
import { synchronizujNaVyzadani } from "../helios/sync.js";

const sVazbami = {
  // Celá historie dílenských stavů, nejnovější první - poslední záznam
  // je ten platný a appka zobrazuje i sled, jak šly za sebou.
  dilenskeZaznamy: { orderBy: { zadanoAt: "desc" } },
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
    // Dílenský stav: poslední záznam, nebo null u zakázky, které ho
    // ještě nikdo nedal. Není to výčet - je to text z číselníku.
    status: zakazka.dilenskeZaznamy[0]?.nazev ?? null,
    statusCode: zakazka.dilenskeZaznamy[0]?.kod ?? null,
    statusHistory: zakazka.dilenskeZaznamy.map((zaznam) => ({
      id: zaznam.id,
      code: zaznam.kod,
      label: zaznam.nazev,
      author: zaznam.zadalKdo,
      createdAt: zaznam.zadanoAt.toISOString().slice(0, 19),
    })),
    branch: pobockaZUtvaru(zakazka.utvarKod),
    department: utvarProApi(zakazka.utvarKod, zakazka.utvarNazev),
    orderType: typProApi(zakazka.radaReference, typy),
    receivedAt: zakazka.datumPrijeti?.toISOString().slice(0, 19) ?? null,
    dueAt: zakazka.terminDokonceni?.toISOString().slice(0, 19) ?? null,
    vin: zakazka.vin ?? "",
    mechanicName: null,
    serviceAdvisorName: null,
    bay: zakazka.stani ?? null,
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

  /**
   * Přidání dílenského stavu.
   *
   * Stav se **přidává**, neposouvá: oprava po bouračce se vrací i
   * přeskakuje (pojišťovna vrátí rozpočet, díl dorazí poškozený), takže
   * žádné pravidlo o krocích dopředu neplatí.
   *
   * Buď `code` z číselníku, nebo `label` s vlastním textem. Název se
   * ukládá i u číselníkového stavu - přejmenování v číselníku nesmí
   * zpětně přepsat, co se na zakázce dělo.
   */
  const stavSchema = z
    .object({
      code: z.string().trim().min(1).max(40).optional(),
      label: z.string().trim().min(1).max(100).optional(),
    })
    .refine((telo) => telo.code || telo.label, {
      message: "Uveďte code z číselníku, nebo vlastní label.",
    });

  server.post<{ Params: { id: string } }>(
    "/orders/:id/stavy",
    async (request, reply) => {
      const telo = stavSchema.safeParse(request.body);
      if (!telo.success) {
        return reply.code(400).send({
          error: {
            code: "bad_request",
            message: "Uveďte stav z číselníku, nebo vlastní text.",
          },
        });
      }

      const zakazka = await nactiJednu(request.params.id);
      if (!zakazka) return reply.code(404).send(nenalezena);

      let kod: string | null = null;
      let nazev = telo.data.label ?? "";

      if (telo.data.code) {
        const zCiselniku = await prisma.dilenskyStavCiselnik.findUnique({
          where: { kod: telo.data.code },
        });
        if (!zCiselniku) {
          return reply.code(400).send({
            error: {
              code: "unknown_status",
              message: "Takový stav v číselníku není.",
            },
          });
        }
        kod = zCiselniku.kod;
        // Název z číselníku má přednost: kdyby appka poslala obojí,
        // platí to, co je v číselníku teď.
        nazev = zCiselniku.nazev;
      }

      await prisma.dilenskyZaznam.create({
        data: {
          cisloZakazky: zakazka.cisloZakazky,
          kod,
          nazev,
          zadalKdo:
            request.zamestnanec?.jmeno ?? request.zamestnanec?.email ?? null,
          zadalUid: request.zamestnanec?.uid ?? null,
        },
      });

      const aktualni = await prisma.heliosZakazka.findUniqueOrThrow({
        where: { cisloZakazky: zakazka.cisloZakazky },
        include: sVazbami,
      });
      return doOdpovedi(aktualni, await nactiTypyZakazek());
    },
  );

  /** Číselník pro nabídku v aplikaci. Vyřazené stavy se nenabízejí. */
  server.get("/stavy", async () => {
    const stavy = await prisma.dilenskyStavCiselnik.findMany({
      where: { jeAktivni: true },
      orderBy: [{ poradi: "asc" }, { nazev: "asc" }],
    });
    return stavy.map((stav) => ({ code: stav.kod, label: stav.nazev }));
  });

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
