/**
 * Pomocníci pro kartu vozidla. Bez databáze, ať jdou testovat.
 */

/**
 * SPZ nebo VIN tak, jak se porovnávají: velká písmena, bez mezer a pomlček.
 *
 * Fotoaparát čte `2BK 9485`, v Heliosu může být `2BK9485` nebo `2bk-9485`
 * - pro člověka tatáž značka, pro `=` tři různé řetězce.
 */
export function kodProHledani(hodnota: string): string {
  return hodnota.toUpperCase().replace(/[\s-]+/g, "");
}

/**
 * Ulice s číslem v českém tvaru: `Masarykova 123/4` (popisné/orientační).
 *
 * Helios vede ulici a obě čísla zvlášť a kterékoli z nich může chybět -
 * na vesnici bývá jen číslo popisné, ulice žádná.
 */
export function uliceSCislem(
  ulice: string | null,
  cisloPopisne: string | null,
  cisloOrientacni: string | null,
): string | null {
  const cislo = [cisloPopisne, cisloOrientacni]
    .filter((c): c is string => Boolean(c))
    .join("/");

  if (ulice && cislo) return `${ulice} ${cislo}`;
  if (ulice) return ulice;
  if (cislo) return `č. p. ${cislo}`;
  return null;
}

/** Jméno a příjmení dohromady, nebo nic, když chybí obojí. */
export function celeJmeno(
  jmeno: string | null,
  prijmeni: string | null,
): string | null {
  const cele = [jmeno, prijmeni].filter(Boolean).join(" ");
  return cele || null;
}
