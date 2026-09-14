/**
 * Ruční načtení všech závad z Heliosu.
 *
 *   npm run zavady
 *
 * Na první naplnění, ať závady u starých zakázek nečekají na noční běh.
 * Závady rozdělaných zakázek se plní samy každých pět minut. Jde pustit
 * kdykoli znovu, nic nemaže.
 *
 * Podmínka: pohled dbo.v_renoworkshop_zavady a v zakázkových pohledech
 * sloupec zakazka_id (docs/sql/zavady.sql).
 */
import "../config.js";
import { prisma } from "../db.js";
import { synchronizujVsechnyZavady } from "../helios/zavady.js";

const zacatek = Date.now();
console.log("Načítám závady z Heliosu...");

try {
  const { pocet } = await synchronizujVsechnyZavady();
  const sekund = Math.round((Date.now() - zacatek) / 1000);
  console.log(`Hotovo za ${sekund} s: ${pocet} závad.`);
} catch (chyba) {
  console.error("Načtení závad selhalo:", chyba);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
