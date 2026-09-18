import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { FastifyInstance, FastifyReply } from "fastify";

import { config } from "../config.js";
import { prisma } from "../db.js";
import {
  jeJpeg,
  jeKategorie,
  najdiPobocku,
  plnaCesta,
  relativniCesta,
  slozkyPobocek,
} from "../domain/fotky.js";
import { mistniCas } from "../domain/cas.js";

/**
 * Fotodokumentace zakázky - nahrání, výpis, stažení a smazání fotek.
 *
 * Soubory jsou ve sdílené složce (`FOTO_ADRESAR`), v databázi jen záznam:
 * kde soubor leží, kategorie, kdo a kdy ho nahrál. Aplikace tak umí rychle
 * ukázat počty a miniatury, aniž by služba procházela složky.
 *
 * Fotka se posílá jako holé JPEG tělo (`Content-Type: image/jpeg`), ne
 * multipart - telefon ji předtím zmenší a nic dalšího k ní nepatří.
 */

/** Zmenšená fotka z telefonu má kolem půl megabajtu, tohle je strop. */
const MAX_VELIKOST = 15 * 1024 * 1024;

const nenalezena = {
  error: { code: "not_found", message: "Zakázka nebyla nalezena." },
};
const fotkaNenalezena = {
  error: { code: "not_found", message: "Fotka nebyla nalezena." },
};

/** Úložiště není nastavené - služba běží, jen bez fotek. */
function bezUloziste(reply: FastifyReply) {
  return reply.code(503).send({
    error: {
      code: "photo_storage_unavailable",
      message: "Úložiště fotodokumentace není na serveru nastavené.",
    },
  });
}

function doOdpovedi(fotka: {
  id: string;
  kategorie: string;
  velikost: number;
  nahralKdo: string | null;
  nahranoAt: Date;
}) {
  return {
    id: fotka.id,
    category: fotka.kategorie,
    size: fotka.velikost,
    uploadedBy: fotka.nahralKdo,
    uploadedAt: fotka.nahranoAt.toISOString().slice(0, 19),
  };
}

export async function fotkyRoutes(server: FastifyInstance): Promise<void> {
  server.addContentTypeParser(
    "image/jpeg",
    { parseAs: "buffer", bodyLimit: MAX_VELIKOST },
    (_request, body, done) => done(null, body),
  );

  /**
   * Složky poboček ve Foto-doc - nabídka pro nastavení aplikace. Čte se
   * přímo ze sdílené složky, takže novou pobočku stačí založit jako složku.
   */
  server.get("/photos/branches", async (request, reply) => {
    const koren = config.FOTO_ADRESAR;
    if (!koren) return bezUloziste(reply);

    try {
      return slozkyPobocek(await readdir(koren, { withFileTypes: true }));
    } catch (chyba) {
      request.log.error({ chyba, koren }, "Složky poboček nejdou přečíst");
      return reply.code(502).send({
        error: {
          code: "photo_storage_failed",
          message: "Složku fotodokumentace se nepodařilo přečíst.",
        },
      });
    }
  });

  /** Fotky zakázky, nejnovější první. */
  server.get<{ Params: { id: string } }>(
    "/orders/:id/photos",
    async (request, reply) => {
      const zakazka = await prisma.heliosZakazka.findUnique({
        where: { cisloZakazky: request.params.id },
        select: { cisloZakazky: true },
      });
      if (!zakazka) return reply.code(404).send(nenalezena);

      const fotky = await prisma.fotka.findMany({
        where: { cisloZakazky: zakazka.cisloZakazky },
        orderBy: { nahranoAt: "desc" },
      });
      return fotky.map(doOdpovedi);
    },
  );

  /**
   * Nahrání jedné fotky do kategorie. Soubor se nejdřív zapíše pod dočasným
   * jménem a pak přejmenuje - kolega, který zrovna prochází složku,
   * neuvidí napůl zapsanou fotku.
   *
   * Pobočku (`branch`) posílá aplikace, když ji má technik zvolenou
   * v nastavení; musí to být existující složka. Bez ní rozhodne pořadač.
   */
  server.post<{
    Params: { id: string };
    Querystring: { category?: string; branch?: string };
  }>(
    "/orders/:id/photos",
    async (request, reply) => {
      const koren = config.FOTO_ADRESAR;
      if (!koren) return bezUloziste(reply);

      const kategorie = request.query.category;
      if (!jeKategorie(kategorie)) {
        return reply.code(400).send({
          error: { code: "bad_request", message: "Neznámá kategorie fotky." },
        });
      }

      const data = request.body;
      if (!Buffer.isBuffer(data) || !jeJpeg(data)) {
        return reply.code(400).send({
          error: { code: "bad_request", message: "Fotka musí být JPEG." },
        });
      }

      const zakazka = await prisma.heliosZakazka.findUnique({
        where: { cisloZakazky: request.params.id },
        select: { cisloZakazky: true, cisloPoradace: true },
      });
      if (!zakazka) return reply.code(404).send(nenalezena);

      let slozkaPobocky: string | null = null;
      const pozadovana = request.query.branch?.trim();
      if (pozadovana) {
        let slozky: string[];
        try {
          slozky = slozkyPobocek(await readdir(koren, { withFileTypes: true }));
        } catch (chyba) {
          request.log.error({ chyba, koren }, "Složky poboček nejdou přečíst");
          return reply.code(502).send({
            error: {
              code: "photo_storage_failed",
              message:
                "Fotku se nepodařilo uložit na souborový server. Zkuste to znovu.",
            },
          });
        }
        slozkaPobocky = najdiPobocku(pozadovana, slozky);
        if (!slozkaPobocky) {
          return reply.code(400).send({
            error: {
              code: "unknown_branch",
              message: `Pobočka „${pozadovana}" ve fotodokumentaci není. Vyberte ji v nastavení znovu.`,
            },
          });
        }
      } else if (zakazka.cisloPoradace !== null) {
        const poradac = await prisma.poradac.findUnique({
          where: { cisloPoradace: zakazka.cisloPoradace },
          select: { slozka: true },
        });
        slozkaPobocky = poradac?.slozka ?? null;
      }

      const id = randomBytes(12).toString("hex");
      const cas = mistniCas();
      const relativni = relativniCesta({
        slozkaPobocky,
        cisloZakazky: zakazka.cisloZakazky,
        kategorie,
        cas,
        id,
      });
      const cil = plnaCesta(koren, relativni);
      if (!cil) {
        return reply.code(400).send({
          error: { code: "bad_request", message: "Neplatná cesta fotky." },
        });
      }

      try {
        await mkdir(path.dirname(cil), { recursive: true });
        const docasny = `${cil}.ukladam`;
        await writeFile(docasny, data);
        await rename(docasny, cil);
      } catch (chyba) {
        request.log.error({ chyba, cil }, "Fotku se nepodařilo uložit");
        return reply.code(502).send({
          error: {
            code: "photo_storage_failed",
            message:
              "Fotku se nepodařilo uložit na souborový server. Zkuste to znovu.",
          },
        });
      }

      const fotka = await prisma.fotka.create({
        data: {
          id,
          cisloZakazky: zakazka.cisloZakazky,
          kategorie,
          cesta: relativni,
          velikost: data.length,
          nahralKdo:
            request.zamestnanec?.jmeno ?? request.zamestnanec?.email ?? null,
          nahralUid: request.zamestnanec?.uid ?? null,
          nahranoAt: cas,
        },
      });

      return reply.code(201).send(doOdpovedi(fotka));
    },
  );

  /** Soubor fotky. Jen pro přihlášené, stejně jako všechno pod /api. */
  server.get<{ Params: { id: string } }>(
    "/photos/:id",
    async (request, reply) => {
      const koren = config.FOTO_ADRESAR;
      if (!koren) return bezUloziste(reply);

      const fotka = await prisma.fotka.findUnique({
        where: { id: request.params.id },
      });
      const cesta = fotka && plnaCesta(koren, fotka.cesta);
      if (!cesta) return reply.code(404).send(fotkaNenalezena);

      try {
        await stat(cesta);
      } catch {
        return reply.code(404).send(fotkaNenalezena);
      }

      return reply
        .type("image/jpeg")
        // Fotka se pod stejným id nikdy nemění - telefon ji smí držet.
        .header("Cache-Control", "private, max-age=604800, immutable")
        .send(createReadStream(cesta));
    },
  );

  /**
   * Smazání fotky - omylem vyfocená nebo nepovedená. Smaže soubor i záznam;
   * chybějící soubor není chyba, záznam se odstraní i tak.
   */
  server.delete<{ Params: { id: string } }>(
    "/photos/:id",
    async (request, reply) => {
      const koren = config.FOTO_ADRESAR;
      if (!koren) return bezUloziste(reply);

      const fotka = await prisma.fotka.findUnique({
        where: { id: request.params.id },
      });
      if (!fotka) return reply.code(404).send(fotkaNenalezena);

      const cesta = plnaCesta(koren, fotka.cesta);
      if (cesta) {
        try {
          await rm(cesta, { force: true });
        } catch (chyba) {
          request.log.error({ chyba, cesta }, "Fotku se nepodařilo smazat");
          return reply.code(502).send({
            error: {
              code: "photo_storage_failed",
              message: "Fotku se nepodařilo smazat ze souborového serveru.",
            },
          });
        }
      }

      await prisma.fotka.delete({ where: { id: fotka.id } });
      return reply.code(204).send();
    },
  );
}
