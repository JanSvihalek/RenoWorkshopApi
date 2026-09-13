import { prisma } from "../db.js";

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
   * Číslo řady zakázky (`801` běžná, `802` interní, `803` PDI...).
   * V pohledu je to `rada.reference_subjektu`. Název se k němu dohledává
   * v naší tabulce `typy_zakazek`.
   *
   * Nepovinné schválně: dotaz je `select *`, takže dokud pohled sloupec
   * nevrací, prostě chybí a synchronizace běží dál. Odpadá tím starost,
   * jestli se dřív nasadí služba, nebo upraví pohled.
   */
  zakazka_rada?: string | number | null;

  /**
   * Kdo za zakázku zodpovídá - kód a jméno z `subjekty`. Nepovinné jako
   * ostatní pozdější doplňky: dokud je pohled nevrací, chybí a nic se
   * nerozbije.
   */
  zodpovida_kod?: string | null;
  zodpovida?: string | null;

  /**
   * `cislo_subjektu` vozidla a organizace z Heliosu. Pohled je zná odjakživa
   * (joinuje se přes ně na `ino_vozidlo` a `organizace`), jen je nevracel.
   * Nepovinné jako ostatní doplňky - dokud je pohled neposílá, zakázka je
   * nemá a nic se nerozbije.
   */
  vozidlo_id?: number | string | null;
  organizace_id?: number | string | null;
};

export async function nactiZakazky(): Promise<ZakazkaZHeliosu[]> {
  return prisma.$queryRaw<ZakazkaZHeliosu[]>`
    select * from dbo.v_renoworkshop_zakazky
  `;
}
