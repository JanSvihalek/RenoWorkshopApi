/**
 * Převod hodnot z Heliosu na to, co ukládáme.
 *
 * Společné pro zakázky, historii i zrcadla. Obě funkce radši hodnotu
 * zahodí, než aby vyhodily chybu: jedna divná hodnota nesmí shodit celou
 * dávku, natož synchronizaci celé dílny.
 */

/**
 * Text z Heliosu. Prázdný řetězec bereme jako nevyplněno.
 *
 * Přijímá i číslo: PSČ, IČO nebo číslo popisné bývají v LCS podle tabulky
 * jednou text a jednou číslo, a `.trim()` na čísle by shodilo celou dávku.
 */
export function text(hodnota: string | number | null | undefined): string | null {
  if (hodnota === null || hodnota === undefined) return null;
  const orezane = String(hodnota).trim();
  return orezane ? orezane : null;
}

/**
 * Celé číslo, nebo nic - `cislo_subjektu`, stav tachometru. Nečekaná
 * hodnota se zahodí: zakázka pak jen nemá odkaz na vozidlo, což je pořád
 * lepší než spadlá synchronizace.
 */
export function cislo(hodnota: number | string | null | undefined): number | null {
  if (hodnota === null || hodnota === undefined || hodnota === "") return null;
  const prevedene = Math.round(Number(hodnota));
  return Number.isFinite(prevedene) ? prevedene : null;
}
