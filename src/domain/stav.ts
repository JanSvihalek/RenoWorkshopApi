/**
 * Stavy zakázky.
 *
 * Aplikace pracuje s **dílenským stavem**, který si RenoWorkshop drží sám -
 * v Heliosu takové členění není. Helios vede vlastní `stav_real`
 * (číselník „Stav skutečný"), který se používá ke dvěma věcem:
 *
 *  1. při prvním načtení zakázky se z něj odvodí výchozí dílenský stav,
 *     aby appka nezačínala se vším na „Přijato",
 *  2. podle něj se pozná, že zakázka na dílnu už nepatří.
 *
 * Jakmile stav jednou posune mechanik, Helios ho už nepřepisuje.
 */

export const STAVY = [
  'received',
  'diagnostics',
  'waiting_for_parts',
  'in_repair',
  'quality_check',
  'ready_for_pickup',
  'picked_up',
] as const;

export type Stav = (typeof STAVY)[number];

/** Číselník Heliosu: `stav_real` -> zobrazovaná hodnota. */
export const STAVY_HELIOS: Record<number, string> = {
  1: 'Zavedeno',
  2: 'Zpracovává se',
  3: 'Ukončeno',
  10: 'Nerealizuje se',
  20: 'Přijmuto',
  30: 'Zpracováváno',
  33: 'Uvolněno',
  36: 'K fakturaci',
  40: 'Dodáno',
  41: 'Částečně dodáno',
  42: 'Nenaskladněno',
  50: 'Dokončeno',
  55: 'Ke schválení',
  60: 'Plán potvrzen',
  63: 'Rezervováno',
  70: 'Pozastaveno',
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

/**
 * Výchozí dílenský stav odvozený z Heliosu. Použije se jen jednou, při
 * prvním načtení zakázky.
 *
 * Mapování je zámerně opatrné: kde si nejsme jistí, vrací `received`,
 * protože posunout stav dopředu je pro mechanika snazší než vysvětlovat,
 * proč appka tvrdí něco, co neplatí.
 */
export function vychoziStav(stavReal: number | null | undefined): Stav {
  switch (stavReal) {
    case 42: // Nenaskladněno - čeká se na díly
    case 63: // Rezervováno
      return 'waiting_for_parts';
    case 2: // Zpracovává se
    case 30: // Zpracováváno
      return 'in_repair';
    case 55: // Ke schválení
      return 'quality_check';
    case 36: // K fakturaci - hotovo, čeká na zákazníka
      return 'ready_for_pickup';
    default:
      return 'received';
  }
}

/** Posun smí být jen o jeden krok dopředu. */
export function jePlatnyPosun(zeStavu: Stav, doStavu: Stav): boolean {
  return STAVY.indexOf(doStavu) === STAVY.indexOf(zeStavu) + 1;
}
