import { describe, expect, it } from "vitest";

import {
  bezDuplicit,
  radkuVDavce,
  sestavDavky,
  type Radek,
  type Sloupec,
} from "../src/helios/davka.js";

const SLOUPCE: Sloupec[] = [
  { nazev: "cislo_subjektu", typ: "int" },
  { nazev: "nazev_subjektu", typ: "nvarchar(255)" },
  { nazev: "ico", typ: "nvarchar(20)" },
  { nazev: "videno_at", typ: "datetime2" },
];

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
    const sloupce: Sloupec[] = Array.from({ length: 14 }, (_, i) => ({
      nazev: i === 0 ? "cislo_subjektu" : `sloupec_${i}`,
      typ: i === 0 ? "int" : "nvarchar(255)",
    }));
    const data: Radek[] = Array.from({ length: 61201 }, (_, i) =>
      Object.fromEntries(
        sloupce.map((s) => [s.nazev, s.nazev === "cislo_subjektu" ? i : "x"]),
      ),
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
  });

  it("prázdná hodnota má typ cílového sloupce, ne int", () => {
    // Na tomhle spadlo první naplnění: dávka vozidel, z nichž žádné nemělo
    // datum prodeje. SQL Server z hodnot odvodil int a do datetime2 ho
    // převést odmítl ("Operand type clash: int is incompatible with datetime2").
    const sloupce: Sloupec[] = [
      { nazev: "cislo_subjektu", typ: "int" },
      { nazev: "prodej_datum", typ: "datetime2" },
    ];
    const data: Radek[] = [
      { cislo_subjektu: 1, prodej_datum: null },
      { cislo_subjektu: 2, prodej_datum: null },
    ];

    const [prikaz] = sestavDavky("helios_vozidla", "cislo_subjektu", sloupce, data);

    expect(prikaz!.sql).toContain("(?,cast(null as datetime2))");
    // Prázdné hodnoty nejsou parametry, jen klíče.
    expect(prikaz!.values).toEqual([1, 2]);
  });

  it("chybějící sloupec v řádku je taky typovaný null, ne posun sloupců", () => {
    const [prikaz] = sestavDavky("helios_organizace", "cislo_subjektu", SLOUPCE, [
      { cislo_subjektu: 7, nazev_subjektu: "Firma", videno_at: null },
    ]);

    expect(prikaz!.sql).toContain(
      "(?,?,cast(null as nvarchar(20)),cast(null as datetime2))",
    );
  });
});

describe("duplicity v datech z Heliosu", () => {
  it("tatáž zakázka dvakrát v jedné dávce se zapíše jednou", () => {
    // Dvě kopie ve stejném MERGE by SQL Server odmítl celé.
    const radky = bezDuplicit("cislo_zakazky", [
      { cislo_zakazky: "Z1", spz: "stará" },
      { cislo_zakazky: "Z2", spz: "jiná" },
      { cislo_zakazky: "Z1", spz: "nová" },
    ]);

    expect(radky).toEqual([
      { cislo_zakazky: "Z2", spz: "jiná" },
      { cislo_zakazky: "Z1", spz: "nová" },
    ]);
  });

  it("mezery na konci klíče páruje stejně jako SQL Server", () => {
    const radky = bezDuplicit("cislo_zakazky", [
      { cislo_zakazky: "Z1" },
      { cislo_zakazky: "Z1 " },
    ]);
    expect(radky).toHaveLength(1);
  });

  it("číselné klíče nesplete s textovými", () => {
    expect(
      bezDuplicit("cislo_subjektu", [{ cislo_subjektu: 1 }, { cislo_subjektu: 2 }]),
    ).toHaveLength(2);
  });
});
