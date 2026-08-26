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
};

export type UkonZHeliosu = {
  c_zakazky: string;
  ukon_id: number;
  ukon: string;
};

export async function nactiZakazky(): Promise<ZakazkaZHeliosu[]> {
  return prisma.$queryRaw<ZakazkaZHeliosu[]>`
    select * from dbo.v_renoworkshop_zakazky
  `;
}

export async function nactiUkony(): Promise<UkonZHeliosu[]> {
  return prisma.$queryRaw<UkonZHeliosu[]>`
    select * from dbo.v_renoworkshop_ukony
  `;
}
