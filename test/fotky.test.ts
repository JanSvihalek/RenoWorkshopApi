import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  bezpecnyNazev,
  jeJpeg,
  jeKategorie,
  najdiPobocku,
  nazevPobocky,
  NEZARAZENO,
  plnaCesta,
  relativniCesta,
  slozkyPobocek,
} from "../src/domain/fotky.js";

describe("cesta fotky", () => {
  const cas = new Date(2026, 8, 15, 10, 30, 12);

  it("pobočka, zakázka, kategorie, čas a id", () => {
    expect(
      relativniCesta({
        slozkaPobocky: "Brno",
        cisloZakazky: "Z1212600123",
        kategorie: "exterier",
        cas,
        id: "a1b2c3d4e5f6a7b8c9d0e1f2",
      }),
    ).toBe(
      path.join("Brno", "Z1212600123", "Exterier", "20260915-103012-c9d0e1f2.jpg"),
    );
  });

  it("zakázka bez pobočky jde do Nezarazeno, ne se ztratí", () => {
    const cesta = relativniCesta({
      slozkaPobocky: null,
      cisloZakazky: "Z1",
      kategorie: "vin",
      cas,
      id: "abc",
    });
    expect(cesta.split(path.sep)[0]).toBe(NEZARAZENO);
  });

  it("z čísla zakázky se nedá utéct mimo úložiště", () => {
    expect(bezpecnyNazev("..\\..\\Windows")).not.toContain("..");
    expect(bezpecnyNazev("../../etc")).not.toContain("/");
    expect(bezpecnyNazev("Čestlice")).toBe("Cestlice");
    expect(bezpecnyNazev("")).toBe(NEZARAZENO);
  });

  it("plná cesta mimo kořen se odmítne", () => {
    const koren = path.resolve("/foto");
    expect(plnaCesta(koren, path.join("Brno", "Z1", "VIN", "x.jpg"))).toBe(
      path.join(koren, "Brno", "Z1", "VIN", "x.jpg"),
    );
    expect(plnaCesta(koren, path.join("..", "jinde.jpg"))).toBeNull();
    expect(plnaCesta(koren, "")).toBeNull();
  });
});

describe("pobočky", () => {
  const polozka = (name: string, slozka = true) => ({
    name,
    isDirectory: () => slozka,
  });

  it("nabídne jen složky poboček, bez Nezarazeno a skrytých", () => {
    expect(
      slozkyPobocek([
        polozka("KCP"),
        polozka("Nezarazeno"),
        polozka("Brno"),
        polozka(".snapshot"),
        polozka("navod.docx", false),
        polozka("Čestlice"),
      ]),
    ).toEqual(["Brno", "Čestlice", "KCP"]);
  });

  it("zvolenou pobočku najde bez ohledu na velikost písmen", () => {
    const slozky = ["Brno", "Cestlice", "KCP"];
    expect(najdiPobocku(" brno ", slozky)).toBe("Brno");
    expect(najdiPobocku("kcp", slozky)).toBe("KCP");
  });

  it("složka pobočky si nechá diakritiku, ale z úložiště neuteče", () => {
    expect(nazevPobocky("Bubeneč")).toBe("Bubeneč");
    expect(nazevPobocky("..\\..\\Windows")).toBe(NEZARAZENO);
    expect(nazevPobocky("Brno/../x")).toBe(NEZARAZENO);
    expect(nazevPobocky("  ")).toBe(NEZARAZENO);
  });

  it("neexistující pobočku odmítne, ať nevznikne nová složka", () => {
    const slozky = ["Brno", "KCP"];
    expect(najdiPobocku("Brnoo", slozky)).toBeNull();
    expect(najdiPobocku("..", slozky)).toBeNull();
    expect(najdiPobocku("", slozky)).toBeNull();
  });
});

describe("nahrání", () => {
  it("pozná kategorii", () => {
    expect(jeKategorie("poskozeni")).toBe(true);
    expect(jeKategorie("toString")).toBe(false);
    expect(jeKategorie("neco")).toBe(false);
  });

  it("přijme jen JPEG", () => {
    expect(jeJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe(true);
    expect(jeJpeg(Buffer.from("<html>"))).toBe(false);
  });
});
