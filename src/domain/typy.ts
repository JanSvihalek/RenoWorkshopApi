import { prisma } from "../db.js";

/**
 * Typy (řady) zakázek - běžná, interní, PDI, montáž...
 *
 * Helios vrací jen číslo řady (`801`). Názvy k nim si drží **naše**
 * databáze v tabulce `typy_zakazek`, protože:
 *
 * - číslo je stabilní klíč, který přejmenování řady v Heliosu nerozbije,
 * - názvy se dají upravit jedním `UPDATE` bez nasazování čehokoli,
 * - do telefonu tak jdou krátké texty, které se vejdou na kartu.
 *
 * Neznámé číslo se nezahazuje: pošle se jako název samo číslo. V appce
 * je pak vidět, že do převodní tabulky přibyla práce, a zakázka nikam
 * nezmizí.
 */

export type TypyZakazek = ReadonlyMap<string, string>;

/**
 * Načte převodní tabulku. Bez cache schválně - tabulka má jednotky řádků
 * a leží v téže databázi jako zakázky, takže je dotaz levnější než
 * starost o to, kdy se má cache po ruční úpravě názvu zahodit.
 */
export async function nactiTypyZakazek(): Promise<TypyZakazek> {
  const radky = await prisma.typZakazky.findMany();
  return new Map(radky.map((typ) => [typ.kod, typ.nazev]));
}

/** Tvar pro API: `{code, label}` jako u útvaru, nebo `null`. */
export function typProApi(kod: string | null, typy: TypyZakazek) {
  if (!kod) return null;
  const nazev = typy.get(kod)?.trim();
  return { code: kod, label: nazev && nazev.length > 0 ? nazev : kod };
}
