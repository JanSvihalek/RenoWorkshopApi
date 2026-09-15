import { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { prisma } from "../db.js";
import {
  chybejici,
  jePlatneDatum,
  polozkyPrijmu,
  stavPrijmu,
  typKontroly,
  type PolozkaPrijmu,
} from "../domain/prijem.js";

/**
 * Příjem vozidla - checklist kontrol při příjmu zakázky.
 *
 * Každá změna položky se ukládá hned (technik odejde od vozu, telefon
 * zhasne) a vrací celý příjem. Dokončit jde jen s vyplněným checklistem;
 * dokončený příjem je zamčený, dokud ho někdo znovu neotevře.
 */

const nenalezena = {
  error: { code: "not_found", message: "Zakázka nebyla nalezena." },
};

const cas = (datum: Date | null) => datum?.toISOString().slice(0, 19) ?? null;

function kdo(request: FastifyRequest) {
  return {
    jmeno: request.zamestnanec?.jmeno ?? request.zamestnanec?.email ?? null,
    uid: request.zamestnanec?.uid ?? null,
  };
}

async function nactiPrijem(cisloZakazky: string) {
  const [ciselnik, prijem] = await Promise.all([
    prisma.prijemKontrolaCiselnik.findMany({
      where: { jeAktivni: true },
      orderBy: [{ poradi: "asc" }, { nazev: "asc" }],
    }),
    prisma.prijem.findUnique({
      where: { cisloZakazky },
      include: { polozky: { orderBy: { zmenenoAt: "asc" } } },
    }),
  ]);
  const polozky = polozkyPrijmu(ciselnik, prijem?.polozky ?? []);
  return { prijem, polozky };
}

function doOdpovedi({
  prijem,
  polozky,
}: Awaited<ReturnType<typeof nactiPrijem>>) {
  return {
    status: stavPrijmu(prijem),
    startedBy: prijem?.zahajilKdo ?? null,
    startedAt: cas(prijem?.zahajenoAt ?? null),
    completedBy: prijem?.dokoncilKdo ?? null,
    completedAt: cas(prijem?.dokoncenoAt ?? null),
    missing: chybejici(polozky).length,
    items: polozky.map((p: PolozkaPrijmu) => ({
      code: p.kod,
      label: p.nazev,
      type: p.typ === "datum" ? "date" : "check",
      required: p.povinna,
      checked: p.splneno,
      value: p.hodnota,
      note: p.poznamka,
      changedBy: p.zmenilKdo,
      changedAt: cas(p.zmenenoAt),
    })),
  };
}

async function existujeZakazka(cisloZakazky: string) {
  const zakazka = await prisma.heliosZakazka.findUnique({
    where: { cisloZakazky },
    select: { cisloZakazky: true },
  });
  return zakazka !== null;
}

const polozkaSchema = z.object({
  checked: z.boolean().optional(),
  value: z.string().trim().max(40).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function prijemRoutes(server: FastifyInstance): Promise<void> {
  /** Příjem zakázky. U zakázky bez příjmu vrací prázdný checklist. */
  server.get<{ Params: { id: string } }>(
    "/orders/:id/intake",
    async (request, reply) => {
      if (!(await existujeZakazka(request.params.id))) {
        return reply.code(404).send(nenalezena);
      }
      return doOdpovedi(await nactiPrijem(request.params.id));
    },
  );

  /**
   * Změna jedné položky checklistu. Posílá se jen to, co se mění. První
   * změna příjem založí.
   */
  server.put<{ Params: { id: string; kod: string } }>(
    "/orders/:id/intake/items/:kod",
    async (request, reply) => {
      const telo = polozkaSchema.safeParse(request.body);
      if (!telo.success) {
        return reply.code(400).send({
          error: {
            code: "bad_request",
            message: "Neplatná položka příjmu (poznámka nejvýš 500 znaků).",
          },
        });
      }

      const cisloZakazky = request.params.id;
      if (!(await existujeZakazka(cisloZakazky))) {
        return reply.code(404).send(nenalezena);
      }

      const kontrola = await prisma.prijemKontrolaCiselnik.findUnique({
        where: { kod: request.params.kod },
      });
      if (!kontrola || !kontrola.jeAktivni) {
        return reply.code(404).send({
          error: {
            code: "unknown_item",
            message: "Tahle kontrola v checklistu příjmu už není.",
          },
        });
      }

      const { checked, note } = telo.data;
      const value = telo.data.value === "" ? null : telo.data.value;
      if (
        typKontroly(kontrola.typ) === "datum" &&
        value !== undefined &&
        value !== null &&
        !jePlatneDatum(value)
      ) {
        return reply.code(400).send({
          error: {
            code: "bad_request",
            message: "Datum musí být ve tvaru RRRR-MM-DD.",
          },
        });
      }

      const stavajici = await prisma.prijem.findUnique({
        where: { cisloZakazky },
        select: { dokoncenoAt: true },
      });
      if (stavajici?.dokoncenoAt) {
        return reply.code(409).send({
          error: {
            code: "intake_completed",
            message: "Příjem je dokončený. Pro úpravu ho znovu otevřete.",
          },
        });
      }

      const { jmeno, uid } = kdo(request);
      const zmena = {
        ...(checked !== undefined && { splneno: checked }),
        ...(value !== undefined && { hodnota: value }),
        ...(note !== undefined && { poznamka: note || null }),
      };

      const uloz = () =>
        prisma.prijem.upsert({
          where: { cisloZakazky },
          create: { cisloZakazky, zahajilKdo: jmeno, zahajilUid: uid },
          update: {},
        });
      try {
        await uloz();
      } catch (chyba) {
        // Dva technici u téhož vozu naráz - druhý příjem už založil první.
        if (
          !(chyba instanceof Prisma.PrismaClientKnownRequestError) ||
          chyba.code !== "P2002"
        ) {
          throw chyba;
        }
      }

      await prisma.prijemPolozka.upsert({
        where: { cisloZakazky_kod: { cisloZakazky, kod: kontrola.kod } },
        create: {
          cisloZakazky,
          kod: kontrola.kod,
          nazev: kontrola.nazev,
          typ: kontrola.typ,
          splneno: false,
          ...zmena,
          zmenilKdo: jmeno,
          zmenilUid: uid,
        },
        update: {
          ...zmena,
          // Název z doby poslední změny - to technik na obrazovce viděl.
          nazev: kontrola.nazev,
          zmenilKdo: jmeno,
          zmenilUid: uid,
          zmenenoAt: new Date(),
        },
      });

      return doOdpovedi(await nactiPrijem(cisloZakazky));
    },
  );

  /** Dokončení příjmu. Jen s vyplněným checklistem. */
  server.post<{ Params: { id: string } }>(
    "/orders/:id/intake/complete",
    async (request, reply) => {
      const cisloZakazky = request.params.id;
      if (!(await existujeZakazka(cisloZakazky))) {
        return reply.code(404).send(nenalezena);
      }

      const nacteny = await nactiPrijem(cisloZakazky);
      if (nacteny.prijem?.dokoncenoAt) return doOdpovedi(nacteny);

      const chybi = chybejici(nacteny.polozky);
      if (!nacteny.prijem || chybi.length > 0) {
        return reply.code(422).send({
          error: {
            code: "intake_incomplete",
            message: `Příjem nejde dokončit, chybí: ${chybi
              .map((p) => p.nazev)
              .join("; ")}.`,
          },
        });
      }

      const { jmeno, uid } = kdo(request);
      await prisma.prijem.update({
        where: { cisloZakazky },
        data: {
          dokoncilKdo: jmeno,
          dokoncilUid: uid,
          dokoncenoAt: new Date(),
        },
      });
      return doOdpovedi(await nactiPrijem(cisloZakazky));
    },
  );

  /** Znovuotevření dokončeného příjmu - oprava omylem potvrzené položky. */
  server.delete<{ Params: { id: string } }>(
    "/orders/:id/intake/complete",
    async (request, reply) => {
      const cisloZakazky = request.params.id;
      if (!(await existujeZakazka(cisloZakazky))) {
        return reply.code(404).send(nenalezena);
      }
      await prisma.prijem.updateMany({
        where: { cisloZakazky },
        data: { dokoncilKdo: null, dokoncilUid: null, dokoncenoAt: null },
      });
      return doOdpovedi(await nactiPrijem(cisloZakazky));
    },
  );
}
