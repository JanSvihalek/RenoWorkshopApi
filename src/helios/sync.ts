import { prisma } from '../db.js';
import { jeUkoncena, vychoziStav } from '../domain/stav.js';
import { nactiZakazky, type ZakazkaZHeliosu } from './cteni.js';

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
/**
 * Kód typu zakázky z Heliosu. Číselníky tam bývají číselné, sloupec ale
 * může být i textový - do naší tabulky jde vždycky text, aby se s ním
 * dalo zacházet stejně jako s kódem útvaru.
 */
function typKod(z: ZakazkaZHeliosu): string | null {
  const kod = z.typ_kod;
  if (kod === null || kod === undefined) return null;
  const text = String(kod).trim();
  return text === '' ? null : text;
}

export async function synchronizuj(): Promise<{ pocet: number }> {
  const beh = await prisma.synchronizace.create({
    data: { zacatekAt: new Date() },
  });

  try {
    const zakazky = await nactiZakazky();
    const ted = new Date();

    // Pohled v_renoworkshop_zakazky vrací jen rozdělané zakázky; tahle
    // pojistka je pro případ, že by se filtr v pohledu někdy změnil.
    const aktivni = zakazky.filter((z) => !jeUkoncena(z.stav_real));

    for (const z of aktivni) {
      await prisma.heliosZakazka.upsert({
        where: { cisloZakazky: z.c_zakazky },
        create: {
          cisloZakazky: z.c_zakazky,
          jeAktivni: true,
          spz: z.spz,
          vin: z.vin,
          model: z.model,
          zakaznik: z.organizace,
          utvarKod: z.utvar,
          utvarNazev: z.utvar_nazev,
          typKod: typKod(z),
          typNazev: z.typ_nazev ?? null,
          datumPrijeti: z.datum_prijeti,
          terminDokonceni: z.predpoklad_datum_dokonceni,
          stavRealCislo: z.stav_real,
          stavRealNazev: z.stav_HeN,
          videnoAt: ted,
          // Výchozí stav jen při prvním vidění zakázky.
          dilensky: { create: { stav: vychoziStav(z.stav_real) } },
        },
        update: {
          // Zakázka se může na dílnu vrátit (reklamace, dodělávka).
          jeAktivni: true,
          uzavrenaAt: null,
          spz: z.spz,
          vin: z.vin,
          model: z.model,
          zakaznik: z.organizace,
          utvarKod: z.utvar,
          utvarNazev: z.utvar_nazev,
          typKod: typKod(z),
          typNazev: z.typ_nazev ?? null,
          datumPrijeti: z.datum_prijeti,
          terminDokonceni: z.predpoklad_datum_dokonceni,
          stavRealCislo: z.stav_real,
          stavRealNazev: z.stav_HeN,
          videnoAt: ted,
        },
      });
    }

    // Co Helios přestal vracet mezi aktivními, se **označí jako uzavřené**.
    // Nemaže se: k poznámkám a fotodokumentaci se lidé vracejí i po roce
    // a Helios je nezná, takže by je nikdo neobnovil.
    await prisma.heliosZakazka.updateMany({
      where: { jeAktivni: true, videnoAt: { lt: ted } },
      data: { jeAktivni: false, uzavrenaAt: ted },
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
