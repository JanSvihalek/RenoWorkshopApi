import { Prisma } from "@prisma/client";

import { prisma } from "../db.js";

/**
 * Dávkový zápis do zrcadel Heliosu.
 *
 * Zakázek je půldruhého tisíce a zapisovat je v cyklu po jedné stačí.
 * Vozidel a zákazníků je dohromady přes 190 000 a tam už by to nešlo:
 * každý řádek je jedna cesta na SQL Server tam a zpět, takže by zápis
 * trval řádově déle než samotné čtení z Heliosu.
 *
 * Proto `MERGE` nad seznamem hodnot - jeden příkaz místo stovky řádků.
 * `MERGE` schválně, ne `truncate` + `insert`: zrcadlo se **nikdy nemaže**.
 * Vozidlo zrušené v Heliosu má u svých starých zakázek zůstat čitelné,
 * a během mazání a plnění by aplikace viděla prázdnou tabulku.
 */

/**
 * SQL Server nepustí do jednoho příkazu víc než 2100 parametrů. Necháváme
 * si rezervu - překročení by shodilo celou dávku, ne jeden řádek.
 */
const LIMIT_PARAMETRU = 2000;

export type Radek = Record<string, string | number | Date | null>;

/**
 * Vloží nebo aktualizuje řádky podle klíče. Nic nemaže.
 *
 * Názvy tabulky a sloupců se do příkazu vkládají přímo, ne jako parametry -
 * jinak to SQL neumí. Jsou to naše konstanty ze `zrcadla.ts`, nikdy nic,
 * co by přišlo zvenčí.
 */
export async function ulozDavkove(
  tabulka: string,
  klic: string,
  sloupce: string[],
  radky: Radek[],
): Promise<number> {
  for (const prikaz of sestavDavky(tabulka, klic, sloupce, radky)) {
    await prisma.$executeRaw(prikaz);
  }
  return radky.length;
}

/**
 * `VALUES` v SQL Serveru pojme nejvýš 1000 řádků. U tabulky s pár sloupci
 * by se na to narazilo dřív než na limit parametrů.
 */
const LIMIT_RADKU = 1000;

/** Kolik řádků se vejde do jednoho příkazu. */
export function radkuVDavce(pocetSloupcu: number): number {
  return Math.max(
    1,
    Math.min(LIMIT_RADKU, Math.floor(LIMIT_PARAMETRU / pocetSloupcu)),
  );
}

/**
 * Sestaví příkazy `MERGE`, ale nespustí je. Zvlášť kvůli testům: dělení
 * do dávek je to, co by na produkci spadlo až při plném běhu.
 */
export function sestavDavky(
  tabulka: string,
  klic: string,
  sloupce: string[],
  radky: Radek[],
): Prisma.Sql[] {
  if (radky.length === 0) return [];

  const vDavce = radkuVDavce(sloupce.length);

  const cil = Prisma.raw(`[dbo].[${tabulka}]`);
  const klicSloupec = Prisma.raw(`[${klic}]`);
  const seznamSloupcu = Prisma.raw(sloupce.map((s) => `[${s}]`).join(", "));
  const vlozeni = Prisma.raw(sloupce.map((s) => `zdroj.[${s}]`).join(", "));
  const nastaveni = Prisma.raw(
    sloupce
      .filter((s) => s !== klic)
      .map((s) => `cil.[${s}] = zdroj.[${s}]`)
      .join(", "),
  );

  const prikazy: Prisma.Sql[] = [];

  for (let od = 0; od < radky.length; od += vDavce) {
    const cast = radky.slice(od, od + vDavce);
    const hodnoty = Prisma.join(
      cast.map(
        (radek) =>
          Prisma.sql`(${Prisma.join(sloupce.map((s) => radek[s] ?? null))})`,
      ),
    );

    // HOLDLOCK je u MERGE doporučený - bez něj může souběžný zápis
    // proklouznout mezi kontrolou a vložením a skončit duplicitním klíčem.
    prikazy.push(Prisma.sql`
      merge ${cil} with (holdlock) as cil
      using (values ${hodnoty}) as zdroj (${seznamSloupcu})
      on cil.${klicSloupec} = zdroj.${klicSloupec}
      when matched then update set ${nastaveni}
      when not matched then insert (${seznamSloupcu}) values (${vlozeni});
    `);
  }

  return prikazy;
}
