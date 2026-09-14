import { prisma } from "../db.js";
import { jeUkoncena } from "../domain/stav.js";
import { nactiZakazky, type ZakazkaZHeliosu } from "./cteni.js";
import { cislo, text } from "./prevod.js";
import { synchronizujZavadyRozdelanych } from "./zavady.js";
import { doplnChybejiciZrcadla } from "./zrcadla.js";

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
 * Číslo řady zakázky. Do naší tabulky jde jako text, i když je v Heliosu
 * číselné - zachází se s ním stejně jako s kódem útvaru a slouží jen jako
 * klíč do `typy_zakazek`.
 */
export function radaReference(z: ZakazkaZHeliosu): string | null {
  const kod = z.zakazka_rada;
  if (kod === null || kod === undefined) return null;
  const text = String(kod).trim();
  if (text === "") return null;

  // Pojistka: nečekaně dlouhá hodnota se do sloupce nevejde a shodila by
  // **celou** synchronizaci (P2000), ne jen jednu zakázku. Radši ji
  // zahodíme - zakázka pak nemá typ, což je pořád lepší než zaseknutá
  // dílna. Pohled sice pouští jen řady 8xx, ale filtr v něm se dá změnit.
  return text.length <= DELKA_RADY ? text : null;
}

/**
 * `cislo_subjektu` hlavičky zakázky - klíč pro napojení závad. Pohled ho
 * smí vracet jako `zakazka_id` i pod původním jménem `cislo_subjektu`.
 */
export function idHlavicky(z: ZakazkaZHeliosu): number | null {
  return cislo(z.zakazka_id ?? z.cislo_subjektu);
}

/** Musí odpovídat NVarChar(50) u `rada_reference` v prisma/schema.prisma. */
const DELKA_RADY = 50;

export async function synchronizuj(): Promise<{ pocet: number }> {
  const beh = await prisma.synchronizace.create({
    data: { zacatekAt: new Date() },
  });

  try {
    const zakazky = await nactiZakazky();
    const ted = new Date();

    // Pohled v_renoworkshop_zakazky má vracet jen rozdělané zakázky;
    // ukončené tahá zvlášť noční historie (historie.ts). Tahle pojistka je
    // pro případ, že by se filtr v pohledu změnil - ukončenou zakázku
    // nesmí pětiminutový běh označit jako aktivní.
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
          radaReference: radaReference(z),
          vozidloId: cislo(z.vozidlo_id),
          organizaceId: cislo(z.organizace_id),
          zakazkaId: idHlavicky(z),
          pojistovnaId: cislo(z.pojistovna1),
          zodpovidaKod: text(z.zodpovida_kod),
          zodpovida: text(z.zodpovida),
          datumPrijeti: z.datum_prijeti,
          terminDokonceni: z.predpoklad_datum_dokonceni,
          stavRealCislo: z.stav_real,
          stavRealNazev: z.stav_HeN,
          videnoAt: ted,
          // Dílenský stav se z Heliosu neodvozuje. Zakázka ho nemá, dokud
          // ho někdo na dílně nezadá - tvrdit za něj "Přijato" by znamenalo
          // ukazovat stav, který nikdo nepotvrdil.
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
          radaReference: radaReference(z),
          vozidloId: cislo(z.vozidlo_id),
          organizaceId: cislo(z.organizace_id),
          zakazkaId: idHlavicky(z),
          pojistovnaId: cislo(z.pojistovna1),
          zodpovidaKod: text(z.zodpovida_kod),
          zodpovida: text(z.zodpovida),
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

    // Až po zapsání zakázek a mimo jejich chybu: když se Helios na vozidlo
    // zrovna nedá doptat, zakázky už jsou uložené a vozidlo se doplní
    // příští běh. Radši chvíli bez majitele než zakázky, které nedotekly.
    try {
      await doplnChybejiciZrcadla();
    } catch (chyba) {
      console.error("Doplnění vozidel a zákazníků selhalo", chyba);
    }

    // Stejně tak závady: když se nedají načíst, zakázky už jsou uložené.
    try {
      await synchronizujZavadyRozdelanych();
    } catch (chyba) {
      console.error("Synchronizace závad selhala", chyba);
    }

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
    return {
      spustena: false,
      zaSekund: Math.ceil((RUCNI_LIMIT_MS - uplynulo) / 1000),
    };
  }
  posledniRucni = ted;
  const { pocet } = await synchronizuj();
  return { spustena: true, pocet };
}
