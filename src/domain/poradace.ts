import { prisma } from "../db.js";

/**
 * Pořadače zakázek - v Heliosu v zásadě značka a pobočka zpracování
 * („SeZ 2 zpracování zakázky BMW BSL").
 *
 * Stejně jako u typů zakázek chodí z Heliosu jen číslo a krátký název pro
 * aplikaci drží naše tabulka `poradace`. Neznámé číslo se nezahazuje -
 * pošle se jako název samo, ať je vidět, že v tabulce chybí.
 */

export type Poradace = ReadonlyMap<number, string>;

/** Bez cache - tabulka má pár řádků a ruční úprava se má projevit hned. */
export async function nactiPoradace(): Promise<Poradace> {
  const radky = await prisma.poradac.findMany();
  return new Map(radky.map((p) => [p.cisloPoradace, p.nazev]));
}

/** Tvar pro API: `{code, label}` jako u útvaru a typu, nebo `null`. */
export function poradacProApi(cislo: number | null, poradace: Poradace) {
  if (cislo === null) return null;
  const nazev = poradace.get(cislo)?.trim();
  return {
    code: String(cislo),
    label: nazev && nazev.length > 0 ? nazev : String(cislo),
  };
}
