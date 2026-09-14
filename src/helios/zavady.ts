import { prisma } from "../db.js";
import {
  nactiVsechnyZavady,
  nactiZavadyZakazek,
  type ZavadaZHeliosu,
} from "./cteni.js";
import {
  nactiPoCastech,
  ulozDavkove,
  type Radek,
  type Sloupec,
} from "./davka.js";
import { cislo, text } from "./prevod.js";

/**
 * Závady (úkony) na zakázkách z Heliosu.
 *
 *   pětiminutový   závady **rozdělaných** zakázek. Co Helios u nich přestal
 *                  vracet, se smaže - dílna nemá opravovat, co už na
 *                  zakázce není.
 *   noční          závady všech zakázek, ať jsou vidět i u starých zakázek
 *                  na kartě vozidla. Nemaže nic.
 *
 * Závady se k zakázce vážou přes `cislo_subjektu` hlavičky
 * (`helios_zakazky.zakazka_id`), ne přes číslo zakázky.
 */

const SLOUPCE: Sloupec[] = [
  { nazev: "cislo_subjektu", typ: "int" },
  { nazev: "zakazka", typ: "int" },
  { nazev: "reference_subjektu", typ: "nvarchar(50)" },
  { nazev: "nazev_subjektu", typ: "nvarchar(255)" },
  { nazev: "poznamka", typ: "nvarchar(max)" },
  { nazev: "videno_at", typ: "datetime2" },
];

/** Řádek pro `helios_zavady`. Exportováno kvůli testům. */
export function radekZavady(z: ZavadaZHeliosu, ted: Date): Radek {
  return {
    cislo_subjektu: z.cislo_subjektu,
    zakazka: cislo(z.zakazka),
    reference_subjektu: text(z.reference_subjektu),
    nazev_subjektu: text(z.nazev_subjektu),
    // Poznámka je text závady - mezery na začátku a konci nic neznamenají,
    // zalomení uvnitř ano, ta zůstanou.
    poznamka: text(z.poznamka),
    videno_at: ted,
  };
}

/** Kolik klíčů smí jít do jednoho `deleteMany ... in (...)`. */
const KLICU_NA_MAZANI = 2000;

export async function synchronizujZavadyRozdelanych(): Promise<{
  pocet: number;
}> {
  const ted = new Date();

  const zakazky = await prisma.heliosZakazka.findMany({
    where: { jeAktivni: true, zakazkaId: { not: null } },
    select: { zakazkaId: true },
  });
  const idZakazek = zakazky.flatMap((z) =>
    z.zakazkaId === null ? [] : [z.zakazkaId],
  );
  if (idZakazek.length === 0) return { pocet: 0 };

  const zavady = await nactiPoCastech(idZakazek, nactiZavadyZakazek);
  const pocet = await ulozDavkove(
    "helios_zavady",
    "cislo_subjektu",
    SLOUPCE,
    zavady.map((z) => radekZavady(z, ted)),
  );

  // Až po zápisu: co Helios u rozdělaných zakázek v tomhle běhu nevrátil,
  // tam už není. Kdyby čtení spadlo, sem se nedojde a nic se nesmaže.
  for (let od = 0; od < idZakazek.length; od += KLICU_NA_MAZANI) {
    await prisma.heliosZavada.deleteMany({
      where: {
        zakazkaId: { in: idZakazek.slice(od, od + KLICU_NA_MAZANI) },
        videnoAt: { lt: ted },
      },
    });
  }

  return { pocet };
}

/** Noční běh: závady všech zakázek. Nic nemaže. */
export async function synchronizujVsechnyZavady(): Promise<{ pocet: number }> {
  const ted = new Date();
  const pocet = await ulozDavkove(
    "helios_zavady",
    "cislo_subjektu",
    SLOUPCE,
    (await nactiVsechnyZavady()).map((z) => radekZavady(z, ted)),
  );
  return { pocet };
}
