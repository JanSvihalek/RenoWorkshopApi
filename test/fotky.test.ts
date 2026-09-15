import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  bezpecnyNazev,
  jeJpeg,
  jeKategorie,
  NEZARAZENO,
  plnaCesta,
  relativniCesta,
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
