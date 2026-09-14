/**
 * Ruční plná synchronizace vozidel, zákazníků, modelů a kontaktů.
 *
 *   npm run zrcadla
 *
 * Na první naplnění prázdných tabulek, ať se nemusí čekat na noční běh.
 * Jde pustit kdykoli znovu - nic nemaže, jen doplní a aktualizuje.
 * Běžící služba mu nevadí, souběžný zápis ohlídá MERGE s HOLDLOCK.
 */
import "../config.js";
import { prisma } from "../db.js";
import { synchronizujZrcadla } from "../helios/zrcadla.js";

const zacatek = Date.now();
console.log("Načítám vozidla, zákazníky, modely a kontakty z Heliosu...");

try {
  const pocty = await synchronizujZrcadla();
  const sekund = Math.round((Date.now() - zacatek) / 1000);
  console.log(`Hotovo za ${sekund} s:`);
  console.log(`  vozidla     ${pocty.vozidla}`);
  console.log(`  organizace  ${pocty.organizace}`);
  console.log(`  modely      ${pocty.modely}`);
  console.log(`  kontakty    ${pocty.kontakty}`);
} catch (chyba) {
  console.error("Synchronizace selhala:", chyba);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
