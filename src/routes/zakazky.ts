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

export const sVazbami = {
  // Celá historie dílenských stavů, nejnovější první - poslední záznam
  // je ten platný a appka zobrazuje i sled, jak šly za sebou.
  dilenskeZaznamy: { orderBy: { zadanoAt: "desc" } },
  poznamky: { orderBy: { vytvorenoAt: "desc" } },
  dilenskeUdaje: true,
} as const;

type ZakazkaSVazbami = Prisma.HeliosZakazkaGetPayload<{
  include: typeof sVazbami;
}>;

type Zavada = {
  id: number;
  reference: string | null;
  nazev: string | null;
  poznamka: string | null;
};

/**
 * Závady k zakázkám jedním dotazem (po částech kvůli limitu parametrů).
 * Mezi zakázkami a závadami není vazba v databázi - viz HeliosZavada.
 */
async function nactiZavady(
  zakazky: { zakazkaId: number | null }[],
): Promise<Map<number, Zavada[]>> {
  const id = [
    ...new Set(
      zakazky.flatMap((z) => (z.zakazkaId === null ? [] : [z.zakazkaId])),
    ),
  ];
  const podleZakazky = new Map<number, Zavada[]>();

  for (let od = 0; od < id.length; od += 2000) {
    const zavady = await prisma.heliosZavada.findMany({
      where: { zakazkaId: { in: id.slice(od, od + 2000) } },
      // V pořadí, v jakém je poradce v Heliosu zapsal.
      orderBy: { id: "asc" },
    });
    for (const zavada of zavady) {
      if (zavada.zakazkaId === null) continue;
      const seznam = podleZakazky.get(zavada.zakazkaId) ?? [];
      seznam.push(zavada);
      podleZakazky.set(zavada.zakazkaId, seznam);
    }
  }

  return podleZakazky;
}

/**
 * Zakázky v tvaru pro aplikaci - i s typem a závadami. Jediné místo, kudy
 * zakázka jde ven, ať ji seznam, detail, hledání i karta vozidla vrací
 * stejně.
 */
export async function odpovedi(zakazky: ZakazkaSVazbami[]) {
  const [typy, zavady, pojistovny] = await Promise.all([
    nactiTypyZakazek(),
    nactiZavady(zakazky),
    nactiPojistovny(zakazky),
  ]);
  return zakazky.map((zakazka) =>
    doOdpovedi(zakazka, typy, zavady, pojistovny),
  );
}

/**
 * Názvy pojišťoven k zakázkám. Pojišťoven je pár, takže i u seznamu
 * s tisícovkou zakázek jde o jeden krátký dotaz.
 */
async function nactiPojistovny(
  zakazky: { pojistovnaId: number | null }[],
): Promise<Map<number, string>> {
  const id = [
    ...new Set(
      zakazky.flatMap((z) => (z.pojistovnaId === null ? [] : [z.pojistovnaId])),
    ),
  ];
  if (id.length === 0) return new Map();
  const organizace = await prisma.heliosOrganizace.findMany({
    where: { id: { in: id } },
    select: { id: true, nazev: true },
  });
  return new Map(organizace.map((o) => [o.id, o.nazev ?? ""]));
}

async function odpoved(zakazka: ZakazkaSVazbami) {
  const [jedna] = await odpovedi([zakazka]);
  return jedna;
}

/** Tvar odpovědi je daný kontraktem v docs/API.md mobilní aplikace. */
function doOdpovedi(
  zakazka: ZakazkaSVazbami,
  typy: TypyZakazek,
  zavady: Map<number, Zavada[]>,
  pojistovny: Map<number, string>,
) {
  return {
    id: zakazka.cisloZakazky,
    licensePlate: zakazka.spz ?? "",
    model: zakazka.model ?? "",
    customerName: zakazka.zakaznik ?? "",
    // Co se na voze opravuje. Zapisuje dílna ručně, Helios to nezná.
    repairSubject: zakazka.dilenskeUdaje?.predmetOpravy ?? null,
    // Pojišťovna z Heliosu. Když organizace v zrcadle ještě není (noví
    // se doplňují po synchronizaci), pošle se aspoň id a prázdný název.
    insurer:
      zakazka.pojistovnaId === null
        ? null
        : {
            id: zakazka.pojistovnaId,
            name: pojistovny.get(zakazka.pojistovnaId) ?? "",
          },
    insuranceClaimNumber: zakazka.cisloPu,
    // Dílenský stav: poslední záznam, nebo null u zakázky, které ho
    // ještě nikdo nedal. Není to výčet - je to text z číselníku.
    status: zakazka.dilenskeZaznamy[0]?.nazev ?? null,
    statusCode: zakazka.dilenskeZaznamy[0]?.kod ?? null,
    statusHistory: zakazka.dilenskeZaznamy.map((zaznam) => ({
      id: zaznam.id,
      code: zaznam.kod,
      label: zaznam.nazev,
      note: zaznam.poznamka,
      author: zaznam.zadalKdo,
      createdAt: zaznam.zadanoAt.toISOString().slice(0, 19),
    })),
    branch: pobockaZUtvaru(zakazka.utvarKod),
    department: utvarProApi(zakazka.utvarKod, zakazka.utvarNazev),
    orderType: typProApi(zakazka.radaReference, typy),
    receivedAt: zakazka.datumPrijeti?.toISOString().slice(0, 19) ?? null,
    dueAt: zakazka.terminDokonceni?.toISOString().slice(0, 19) ?? null,
    vin: zakazka.vin ?? "",
    // Zodpovědná osoba z Heliosu. V aplikaci je to pole, které se
    // zobrazuje u zakázky jako "Zodpovídá".
    mechanicName: zakazka.zodpovida,
    mechanicCode: zakazka.zodpovidaKod,
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
    // Úkony s odškrtáváním zatím nejsou - závady z Heliosu chodí zvlášť
    // v `defects` a jsou jen ke čtení.
    workItems: [],
    defects: (zakazka.zakazkaId === null
      ? []
      : (zavady.get(zakazka.zakazkaId) ?? [])
    ).map((zavada) => ({
      id: String(zavada.id),
      code: zavada.reference,
      // Stručný popis; `text` jsou podrobnosti pod ním.
      title: zavada.nazev,
      text: zavada.poznamka ?? "",
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
  error: { code: "not_found", message: "Zakázka nebyla nalezena." },
};

export async function zakazkyRoutes(server: FastifyInstance): Promise<void> {
  /**
   * Seznam pro telefon: **všechny rozdělané zakázky**, bez ohledu na stáří.
   *
   * Časové okno tu dřív bylo, ale na klempírně je to chyba: oprava po
   * bouračce běží i půl roku a vůz mezitím stojí v hale. Zakázka, která
   * mizí ze seznamu, přestože na ní někdo pracuje, je horší než delší
   * seznam.
   *
   * Uzavřené se neposílají - je jich desítky tisíc a aplikace si seznam
   * drží v paměti, aby filtrovala a hledala bez čekání. Dohledají se
   * přes `/orders/search`.
   */
  server.get("/orders", async () => {
    const zakazky = await prisma.heliosZakazka.findMany({
      where: { jeAktivni: true },
      include: sVazbami,
      orderBy: { datumPrijeti: "desc" },
    });
    return odpovedi(zakazky);
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
            { cisloPu: { contains: dotaz } },
            // "nárazník" najde zakázky, kde je v předmětu opravy.
            { dilenskeUdaje: { is: { predmetOpravy: { contains: dotaz } } } },
          ],
        },
        include: sVazbami,
        orderBy: { datumPrijeti: "desc" },
        take: config.HLEDANI_LIMIT,
      });

      return odpovedi(zakazky);
    },
  );

  server.get<{ Params: { id: string } }>(
    "/orders/:id",
    async (request, reply) => {
      const zakazka = await nactiJednu(request.params.id);
      if (!zakazka) return reply.code(404).send(nenalezena);
      return odpoved(zakazka);
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
      note: z.string().trim().max(500).optional(),
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
          poznamka: telo.data.note || null,
          zadalKdo:
            request.zamestnanec?.jmeno ?? request.zamestnanec?.email ?? null,
          zadalUid: request.zamestnanec?.uid ?? null,
        },
      });

      const aktualni = await prisma.heliosZakazka.findUniqueOrThrow({
        where: { cisloZakazky: zakazka.cisloZakazky },
        include: sVazbami,
      });
      return odpoved(aktualni);
    },
  );

  /**
   * Smaže jeden záznam z historie stavů.
   *
   * Omylem přidaný stav nemá cenu vláčet historií - je to pracovní
   * přehled dílny, ne auditní doklad. Opravou je smazat a přidat znovu.
   *
   * Mazat smí kdokoli přihlášený: na dílně se u telefonu střídají lidé
   * a čekat na toho, kdo se ťukl, by znamenalo nechat tam nesmysl.
   */
  server.delete<{ Params: { id: string; zaznamId: string } }>(
    "/orders/:id/stavy/:zaznamId",
    async (request, reply) => {
      const zakazka = await nactiJednu(request.params.id);
      if (!zakazka) return reply.code(404).send(nenalezena);

      const smazano = await prisma.dilenskyZaznam.deleteMany({
        where: {
          id: request.params.zaznamId,
          // Vázané na zakázku z adresy: jinak by šlo cizím ID smazat
          // záznam u úplně jiné zakázky.
          cisloZakazky: zakazka.cisloZakazky,
        },
      });

      if (smazano.count === 0) {
        return reply.code(404).send({
          error: {
            code: "not_found",
            message: "Takový záznam u zakázky není.",
          },
        });
      }

      const aktualni = await prisma.heliosZakazka.findUniqueOrThrow({
        where: { cisloZakazky: zakazka.cisloZakazky },
        include: sVazbami,
      });
      return odpoved(aktualni);
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
      return odpoved(aktualni);
    },
  );

  /**
   * Předmět opravy - co se na voze opravuje. Přepisuje se celý; prázdný
   * text ho smaže. Upravit smí kdokoli přihlášený, stejně jako stavy.
   */
  const predmetSchema = z.object({
    text: z.string().max(1000),
  });

  server.put<{ Params: { id: string } }>(
    "/orders/:id/repair-subject",
    async (request, reply) => {
      const telo = predmetSchema.safeParse(request.body);
      if (!telo.success) {
        return reply.code(400).send({
          error: {
            code: "bad_request",
            message: "Předmět opravy je příliš dlouhý (nejvýš 1000 znaků).",
          },
        });
      }

      const zakazka = await nactiJednu(request.params.id);
      if (!zakazka) return reply.code(404).send(nenalezena);

      const text = telo.data.text.trim() || null;
      const kdo =
        request.zamestnanec?.jmeno ?? request.zamestnanec?.email ?? null;
      const uid = request.zamestnanec?.uid ?? null;

      await prisma.dilenskeUdaje.upsert({
        where: { cisloZakazky: zakazka.cisloZakazky },
        create: {
          cisloZakazky: zakazka.cisloZakazky,
          predmetOpravy: text,
          upravilKdo: kdo,
          upravilUid: uid,
        },
        update: {
          predmetOpravy: text,
          upravilKdo: kdo,
          upravilUid: uid,
          upravenoAt: new Date(),
        },
      });

      const aktualni = await prisma.heliosZakazka.findUniqueOrThrow({
        where: { cisloZakazky: zakazka.cisloZakazky },
        include: sVazbami,
      });
      return odpoved(aktualni);
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
