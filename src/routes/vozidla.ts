import type { FastifyInstance } from "fastify";

import { prisma } from "../db.js";
import { celeJmeno, kodProHledani, uliceSCislem } from "../domain/vozidlo.js";
import { odpovedi, sVazbami } from "./zakazky.js";

/**
 * Vozidla - vyhledávání podle SPZ nebo VIN a karta vozidla.
 *
 * Čte jen z našich zrcadel Heliosu (helios_vozidla, helios_organizace,
 * helios_modely, helios_kontakty) a z helios_zakazky. Do Heliosu se
 * při hledání nesahá, takže naskenování SPZ je okamžité a funguje, i když
 * Helios zrovna neodpovídá.
 */

/** Kolik vozidel nejvýš vrátí hledání. Víc se na telefon stejně nevejde. */
const LIMIT_VOZIDEL = 20;

type NalezeneVozidlo = {
  id: number;
  spz: string | null;
  vin: string | null;
  model: string | null;
  majitel: string | null;
  pocet_zakazek: number;
};

const nenalezeno = {
  error: { code: "not_found", message: "Vozidlo nebylo nalezeno." },
};

export async function vozidlaRoutes(server: FastifyInstance): Promise<void> {
  /**
   * Hledání vozidla podle SPZ nebo VIN.
   *
   * Porovnává se bez mezer a pomlček, ať sedí `2BK 9485` z fotoaparátu
   * i `2BK9485` z Heliosu. Stačí část značky - kdo píše ručně, nemusí
   * dopsat celou.
   *
   * Přesná shoda jde první. SPZ se při přeregistraci přiděluje znovu,
   * takže jedna značka může vrátit víc vozidel; aplikace pak nabídne
   * výběr, u jediného výsledku otevře kartu rovnou.
   */
  server.get<{ Querystring: { q?: string } }>(
    "/vehicles/search",
    async (request, reply) => {
      const kod = kodProHledani(request.query.q ?? "");
      if (kod.length < 3) {
        return reply.code(400).send({
          error: {
            code: "bad_request",
            message: "Zadejte alespoň tři znaky SPZ nebo VIN.",
          },
        });
      }

      const obsahuje = `%${kod}%`;

      // Syrový dotaz kvůli replace(): Prisma porovnání bez mezer neumí.
      // Index na spz se tím nevyužije, ale 50 000 řádků je pro SQL Server
      // v řádu milisekund.
      const vozidla = await prisma.$queryRaw<NalezeneVozidlo[]>`
        select top (${LIMIT_VOZIDEL})
               v.cislo_subjektu as id,
               v.spz,
               v.vin,
               coalesce(m.nazev_dlouhy, v.nazev_subjektu) as model,
               o.nazev_subjektu as majitel,
               (select count(*) from helios_zakazky z
                where z.vozidlo_id = v.cislo_subjektu) as pocet_zakazek
        from helios_vozidla v
        left join helios_modely m on m.cislo_subjektu = v.znackamodel
        left join helios_organizace o on o.cislo_subjektu = v.majitel
        where replace(replace(upper(v.spz), ' ', ''), '-', '') like ${obsahuje}
           or replace(upper(v.vin), ' ', '') like ${obsahuje}
        order by
          case when replace(replace(upper(v.spz), ' ', ''), '-', '') = ${kod}
                 or replace(upper(v.vin), ' ', '') = ${kod}
               then 0 else 1 end,
          pocet_zakazek desc
      `;

      return vozidla.map((v) => ({
        id: v.id,
        licensePlate: v.spz ?? "",
        vin: v.vin ?? "",
        model: v.model ?? "",
        ownerName: v.majitel,
        orderCount: Number(v.pocet_zakazek),
      }));
    },
  );

  /**
   * Karta vozidla: údaje vozu, majitel, kontaktní osoba a **všechny**
   * zakázky vozu - rozdělané i ukončené, od nejnovější.
   *
   * Zakázky mají stejný tvar jako v `/orders`, aplikace je tak ukáže
   * stejnými kartami a otevře stejným detailem.
   *
   * Majitel je ten **dnešní** z vozidla. Každá zakázka si nese svého
   * tehdejšího zákazníka (`customerName`) - po prodeji vozu se ty dva
   * rozejdou a právě to má být vidět.
   *
   * Domácí adresa kontaktní osoby se neposílá, i když ji zrcadlo drží:
   * aplikace ji nikde nepotřebuje a z telefonu na dílně nemá co dělat.
   */
  server.get<{ Params: { id: string } }>(
    "/vehicles/:id",
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) return reply.code(404).send(nenalezeno);

      const vozidlo = await prisma.heliosVozidlo.findUnique({ where: { id } });
      if (!vozidlo) return reply.code(404).send(nenalezeno);

      const [model, majitel, kontakt, zakazky] = await Promise.all([
        vozidlo.znackamodelId === null
          ? null
          : prisma.heliosModel.findUnique({
              where: { id: vozidlo.znackamodelId },
            }),
        vozidlo.majitelId === null
          ? null
          : prisma.heliosOrganizace.findUnique({
              where: { id: vozidlo.majitelId },
            }),
        vozidlo.kontaktniOsobaId === null
          ? null
          : prisma.heliosKontakt.findUnique({
              where: { id: vozidlo.kontaktniOsobaId },
            }),
        prisma.heliosZakazka.findMany({
          where: { vozidloId: id },
          include: sVazbami,
          orderBy: { datumPrijeti: "desc" },
        }),
      ]);

      return {
        id: vozidlo.id,
        licensePlate: vozidlo.spz ?? "",
        vin: vozidlo.vin ?? "",
        model: model?.nazevDlouhy ?? vozidlo.nazev ?? "",
        series: model?.serie ?? null,
        fuel: model?.palivo ?? null,
        engine: model?.motor ?? null,
        mileage: vozidlo.stavTachometru,
        soldAt: vozidlo.prodejDatum?.toISOString().slice(0, 10) ?? null,
        owner: majitel && {
          id: majitel.id,
          name: majitel.nazev ?? "",
          customerNumber: majitel.reference,
          ico: majitel.ico,
          dic: majitel.dic,
          street: uliceSCislem(majitel.ulice, majitel.cisloCp, majitel.cisloCo),
          city: majitel.misto,
          zip: majitel.psc,
          phone: majitel.telefon,
          email: majitel.email,
        },
        contact: kontakt && {
          id: kontakt.id,
          name: celeJmeno(kontakt.jmeno, kontakt.prijmeni) ?? "",
          phone: kontakt.telefonMobil,
          email: kontakt.email,
        },
        orders: await odpovedi(zakazky),
      };
    },
  );
}
