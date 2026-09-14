/**
 * Ruční načtení historie zakázek - ukončených zakázek z Heliosu.
 *
 *   npm run historie
 *
 * Na první naplnění, ať se nemusí čekat na noční běh. Jde pustit kdykoli
 * znovu - nic nemaže, jen doplní a aktualizuje. Běžící služba mu nevadí.
 *
 * Podmínka: pohled dbo.v_renoworkshop_zakazky_historie
 * (docs/sql/pohled-historie.sql).
 */
import "../config.js";
import { prisma } from "../db.js";
import { synchronizujHistorii } from "../helios/historie.js";

const zacatek = Date.now();
console.log("Načítám ukončené zakázky z Heliosu...");

try {
  const { pocet } = await synchronizujHistorii();
  const sekund = Math.round((Date.now() - zacatek) / 1000);
  console.log(`Hotovo za ${sekund} s: ${pocet} zakázek.`);
} catch (chyba) {
  console.error("Načtení historie selhalo:", chyba);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
