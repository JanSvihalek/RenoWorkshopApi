import { prisma } from '../db.js';

/**
 * Čtení zakázek z Heliosu.
 *
 * Pohledy `v_renoworkshop_*` leží v databázi RenoWorkshop na RENDCAPPu
 * a přes **linkovaný server** sahají do Heliosu. Díky tomu stačí službě
 * jedno připojení - stejné, přes které zapisuje vlastní tabulky.
 *
 * Do Heliosu se jen čte. Zápis hlídá mapování linkovaného serveru:
 * vzdálený účet má práva pouze `SELECT`.
 */

export type ZakazkaZHeliosu = {
  c_zakazky: string;
  vin: string | null;
  spz: string | null;
  model: string | null;
  organizace: string | null;
  utvar: string | null;
  utvar_nazev: string | null;
  datum_prijeti: Date | null;
  predpoklad_datum_dokonceni: Date | null;
  stav_real: number | null;
  stav_HeN: string | null;
  /**
   * Typ zakázky (běžná, interní, klempířská). Nepovinné schválně:
   * dotaz je `select *`, takže dokud pohled tyhle sloupce nevrací,
   * prostě chybí a synchronizace běží dál. Odpadá tím starost, jestli
   * se dřív nasadí služba, nebo upraví pohled.
   */
  typ_kod?: string | number | null;
  typ_nazev?: string | null;
};

export async function nactiZakazky(): Promise<ZakazkaZHeliosu[]> {
  return prisma.$queryRaw<ZakazkaZHeliosu[]>`
    select * from dbo.v_renoworkshop_zakazky
  `;
}
