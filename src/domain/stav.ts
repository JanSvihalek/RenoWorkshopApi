/**
 * Stavy zakázky.
 *
 * Zakázka má dva nezávislé stavy:
 *
 *  1. **Stav z Heliosu** (`stav_real`) - jen ke čtení, vede ho ERP.
 *     Podle něj se pozná, že zakázka na dílnu už nepatří.
 *  2. **Dílenský stav** - vede si ho RenoWorkshop sám a je podrobnější.
 *     Není to jeden přepisovaný údaj, ale historie záznamů: oprava po
 *     bouračce běží týdny a je potřeba vidět, kdy se co stalo.
 *
 * Co jde vybrat z nabídky, drží tabulka `dilenske_stavy_ciselnik`. Pevný
 * výčet v kódu tu schválně není - dílna si sled prací ladí sama a nová
 * verze aplikace kvůli tomu vycházet nemá.
 *
 * Dílenský stav se z Heliosu **neodvozuje**. Zakázka, kterou nikdo
 * neoznačil, žádný dílenský stav nemá - to je poctivější než tvrdit něco,
 * co nikdo nezadal.
 */

/** Číselník Heliosu: `stav_real` -> zobrazovaná hodnota. */
export const STAVY_HELIOS: Record<number, string> = {
  1: "Zavedeno",
  2: "Zpracovává se",
  3: "Ukončeno",
  10: "Nerealizuje se",
  20: "Přijmuto",
  30: "Zpracováváno",
  33: "Uvolněno",
  36: "K fakturaci",
  40: "Dodáno",
  41: "Částečně dodáno",
  42: "Nenaskladněno",
  50: "Dokončeno",
  55: "Ke schválení",
  60: "Plán potvrzen",
  63: "Rezervováno",
  70: "Pozastaveno",
};

/**
 * Stavy, po kterých vůz na dílně nestojí - zakázka se přestane zobrazovat.
 *
 * `K fakturaci` (36) tu schválně není: vůz bývá hotový, ale pořád na
 * pozemku, a poradce potřebuje vidět, že čeká na vyzvednutí.
 */
const UKONCENE = new Set([3, 10, 50]);

export function jeUkoncena(stavReal: number | null | undefined): boolean {
  return stavReal != null && UKONCENE.has(stavReal);
}
