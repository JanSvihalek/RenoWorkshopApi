import { describe, expect, it } from "vitest";

import { radkuVDavce, sestavDavky, type Radek } from "../src/helios/davka.js";

const SLOUPCE = ["cislo_subjektu", "nazev_subjektu", "ico", "videno_at"];

function radky(pocet: number): Radek[] {
  const ted = new Date("2026-09-14T03:00:00");
  return Array.from({ length: pocet }, (_, i) => ({
    cislo_subjektu: i + 1,
    nazev_subjektu: `Firma ${i + 1}`,
    ico: null,
    videno_at: ted,
  }));
}

describe("dávkový zápis zrcadel", () => {
  it("prázdný vstup nesestaví žádný příkaz", () => {
    expect(sestavDavky("helios_organizace", "cislo_subjektu", SLOUPCE, [])).toEqual(
      [],
    );
  });

  it("žádný příkaz nepřekročí limit parametrů SQL Serveru", () => {
    // Skutečný počet organizací v Heliosu, 14 sloupců jako helios_organizace.
    const sloupce = Array.from({ length: 14 }, (_, i) =>
      i === 0 ? "cislo_subjektu" : `sloupec_${i}`,
    );
    const data: Radek[] = Array.from({ length: 61201 }, (_, i) =>
      Object.fromEntries(sloupce.map((s) => [s, s === "cislo_subjektu" ? i : "x"])),
    );

    const prikazy = sestavDavky("helios_organizace", "cislo_subjektu", sloupce, data);

    for (const prikaz of prikazy) {
      expect(prikaz.values.length).toBeLessThan(2100);
    }
    // Nic se neztratí ani nezdvojí.
    const pocetHodnot = prikazy.reduce((s, p) => s + p.values.length, 0);
    expect(pocetHodnot).toBe(61201 * 14);
  });

  it("u úzké tabulky nepřekročí 1000 řádků ve VALUES", () => {
    expect(radkuVDavce(1)).toBe(1000);
    expect(radkuVDavce(2)).toBe(1000);
    expect(radkuVDavce(14)).toBeLessThanOrEqual(1000);
  });

  it("klíč se neaktualizuje, jen podle něj páruje", () => {
    const [prikaz] = sestavDavky("helios_organizace", "cislo_subjektu", SLOUPCE, radky(3));

    expect(prikaz!.sql).toContain(
      "on cil.[cislo_subjektu] = zdroj.[cislo_subjektu]",
    );
    expect(prikaz!.sql).not.toContain("cil.[cislo_subjektu] = zdroj.[cislo_subjektu],");
    expect(prikaz!.sql).toContain("cil.[nazev_subjektu] = zdroj.[nazev_subjektu]");
  });

  it("nic nemaže - zrcadlo drží i to, co z Heliosu zmizelo", () => {
    const [prikaz] = sestavDavky("helios_vozidla", "cislo_subjektu", SLOUPCE, radky(3));
    expect(prikaz!.sql.toLowerCase()).not.toContain("delete");
    expect(prikaz!.sql.toLowerCase()).not.toContain("not matched by source");
  });

  it("hodnoty jdou jako parametry, ne do textu příkazu", () => {
    const data = radky(1);
    data[0]!.nazev_subjektu = "O'Brien s.r.o.; drop table helios_vozidla";

    const [prikaz] = sestavDavky("helios_organizace", "cislo_subjektu", SLOUPCE, data);

    expect(prikaz!.sql).not.toContain("O'Brien");
    expect(prikaz!.values).toContain("O'Brien s.r.o.; drop table helios_vozidla");
    // Nevyplněné pole je null, ne vynechané - jinak by se posunuly sloupce.
    expect(prikaz!.values).toHaveLength(SLOUPCE.length);
  });
});
