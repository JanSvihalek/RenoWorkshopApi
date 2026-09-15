import { describe, expect, it } from "vitest";

import {
  chybejici,
  jePlatneDatum,
  polozkyPrijmu,
  stavPrijmu,
  type UlozenaPolozka,
} from "../src/domain/prijem.js";

const ciselnik = [
  { kod: "sklo", nazev: "Stěrače, čelní sklo", typ: "kontrola" },
  { kod: "stk", nazev: "Datum platnosti STK", typ: "datum" },
  { kod: "brzdy", nazev: "Brzdy", typ: "kontrola" },
];

const ulozena = (
  kod: string,
  zmena: Partial<UlozenaPolozka> = {},
): UlozenaPolozka => ({
  kod,
  nazev: kod,
  typ: "kontrola",
  splneno: false,
  hodnota: null,
  poznamka: null,
  zmenilKdo: "Jan Dvořák",
  zmenenoAt: new Date(2026, 8, 15),
  ...zmena,
});

describe("checklist příjmu", () => {
  it("nevyplněný příjem vyžaduje všechny aktivní kontroly v pořadí", () => {
    const polozky = polozkyPrijmu(ciselnik, []);
    expect(polozky.map((p) => p.kod)).toEqual(["sklo", "stk", "brzdy"]);
    expect(chybejici(polozky)).toHaveLength(3);
  });

  it("kontrola je vyplněná zaškrtnutím, STK platným datem", () => {
    const polozky = polozkyPrijmu(ciselnik, [
      ulozena("sklo", { splneno: true }),
      // Zaškrtnutí u data nestačí - datum musí být zapsané.
      ulozena("stk", { typ: "datum", splneno: true }),
      ulozena("brzdy", { splneno: true }),
    ]);
    expect(chybejici(polozky).map((p) => p.kod)).toEqual(["stk"]);

    const sDatem = polozkyPrijmu(ciselnik, [
      ulozena("sklo", { splneno: true }),
      ulozena("stk", { typ: "datum", hodnota: "2027-05-31" }),
      ulozena("brzdy", { splneno: true }),
    ]);
    expect(chybejici(sDatem)).toHaveLength(0);
  });

  it("odškrtnutá kontrola zase chybí", () => {
    const polozky = polozkyPrijmu(ciselnik, [
      ulozena("sklo", { splneno: false, poznamka: "prasklé sklo" }),
    ]);
    expect(chybejici(polozky).map((p) => p.kod)).toContain("sklo");
    expect(polozky[0].poznamka).toBe("prasklé sklo");
  });

  it("vyřazená kontrola zůstane vidět, ale není povinná", () => {
    const polozky = polozkyPrijmu(ciselnik, [
      ulozena("stara", { nazev: "Lékárnička", splneno: false }),
    ]);
    const stara = polozky.find((p) => p.kod === "stara")!;
    expect(stara.povinna).toBe(false);
    expect(polozky.at(-1)!.kod).toBe("stara");
    expect(chybejici(polozky).map((p) => p.kod)).not.toContain("stara");
  });

  it("název aktivní kontroly se bere z číselníku", () => {
    const polozky = polozkyPrijmu(ciselnik, [
      ulozena("sklo", { nazev: "Starý název", splneno: true }),
    ]);
    expect(polozky[0].nazev).toBe("Stěrače, čelní sklo");
  });
});

describe("datum STK", () => {
  it("přijme jen existující datum ve tvaru RRRR-MM-DD", () => {
    expect(jePlatneDatum("2027-05-31")).toBe(true);
    expect(jePlatneDatum("2028-02-29")).toBe(true);
    expect(jePlatneDatum("2027-02-30")).toBe(false);
    expect(jePlatneDatum("31.5.2027")).toBe(false);
    expect(jePlatneDatum("")).toBe(false);
    expect(jePlatneDatum(null)).toBe(false);
  });
});

describe("stav příjmu", () => {
  it("rozliší nezahájený, rozpracovaný a dokončený", () => {
    expect(stavPrijmu(null)).toBe("not_started");
    expect(stavPrijmu({ dokoncenoAt: null })).toBe("in_progress");
    expect(stavPrijmu({ dokoncenoAt: new Date() })).toBe("completed");
  });
});
