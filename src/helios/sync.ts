import { prisma } from '../db.js';
import { jeUkoncena, vychoziStav } from '../domain/stav.js';
import { nactiUkony, nactiZakazky } from './klient.js';

/**
 * Přenos zakázek z Heliosu do provozní databáze.
 *
 * Přepisuje **jen** tabulky `helios_*`. Dílenský stav, poznámky a příznak
 * hotového úkonu zůstávají nedotčené - proto jsou v samostatných tabulkách.
 *
 * Nově viděná zakázka dostane výchozí dílenský stav odvozený ze stavu
 * v Heliosu, aby seznam nezačínal se vším na „Přijato". Od té chvíle
 * rozhoduje mechanik a Helios do stavu nemluví.
 */
export async function synchronizuj(): Promise<{ pocet: number }> {
  const beh = await prisma.synchronizace.create({
    data: { zacatekAt: new Date() },
  });

  try {
    const [zakazky, ukony] = await Promise.all([nactiZakazky(), nactiUkony()]);
    const ted = new Date();

    const aktivni = zakazky.filter((z) => !jeUkoncena(z.stav_real));

    for (const z of aktivni) {
      await prisma.heliosZakazka.upsert({
        where: { cisloZakazky: z.c_zakazky },
        create: {
          cisloZakazky: z.c_zakazky,
          spz: z.spz,
          vin: z.vin,
          model: z.model,
          zakaznik: z.organizace,
          utvarKod: z.utvar,
          utvarNazev: z.utvar_nazev,
          datumPrijeti: z.datum_prijeti,
          terminDokonceni: z.predpoklad_datum_dokonceni,
          stavRealCislo: z.stav_real,
          stavRealNazev: z.stav_HeN,
          videnoAt: ted,
          // Výchozí stav jen při prvním vidění zakázky.
          dilensky: { create: { stav: vychoziStav(z.stav_real) } },
        },
        update: {
          spz: z.spz,
          vin: z.vin,
          model: z.model,
          zakaznik: z.organizace,
          utvarKod: z.utvar,
          utvarNazev: z.utvar_nazev,
          datumPrijeti: z.datum_prijeti,
          terminDokonceni: z.predpoklad_datum_dokonceni,
          stavRealCislo: z.stav_real,
          stavRealNazev: z.stav_HeN,
          videnoAt: ted,
        },
      });
    }

    const zname = new Set(aktivni.map((z) => z.c_zakazky));
    for (const u of ukony) {
      if (!zname.has(u.c_zakazky)) continue;
      const id = `${u.c_zakazky}:${u.ukon_id}`;
      await prisma.heliosUkon.upsert({
        where: { id },
        create: { id, cisloZakazky: u.c_zakazky, nazev: u.ukon },
        // `hotovo` schválně nepřepisujeme, to je naše.
        update: { nazev: u.ukon },
      });
    }

    // Co Helios přestal vracet, je uzavřené nebo zrušené. Mizí i s naším
    // stavem a poznámkami - archiv řešit nemusíme, historii vede Helios.
    await prisma.heliosZakazka.deleteMany({
      where: { videnoAt: { lt: ted } },
    });

    await prisma.synchronizace.update({
      where: { id: beh.id },
      data: { konecAt: new Date(), pocetZakazek: aktivni.length },
    });

    return { pocet: aktivni.length };
  } catch (chyba) {
    await prisma.synchronizace.update({
      where: { id: beh.id },
      data: {
        konecAt: new Date(),
        chyba: chyba instanceof Error ? chyba.message : String(chyba),
      },
    });
    throw chyba;
  }
}

/**
 * Ruční vyvolání s omezením: když poradce právě založil zakázku a mechanik
 * na ni čeká, jde synchronizaci vyvolat z aplikace - ale nejvýš jednou za
 * minutu pro celou dílnu, ať se Helios nedá zahltit.
 */
let posledniRucni = 0;
const RUCNI_LIMIT_MS = 60_000;

export async function synchronizujNaVyzadani(): Promise<
  { spustena: true; pocet: number } | { spustena: false; zaSekund: number }
> {
  const ted = Date.now();
  const uplynulo = ted - posledniRucni;
  if (uplynulo < RUCNI_LIMIT_MS) {
    return { spustena: false, zaSekund: Math.ceil((RUCNI_LIMIT_MS - uplynulo) / 1000) };
  }
  posledniRucni = ted;
  const { pocet } = await synchronizuj();
  return { spustena: true, pocet };
}
