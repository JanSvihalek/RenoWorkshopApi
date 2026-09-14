import { describe, expect, it } from "vitest";

import type { ZakazkaZHeliosu } from "../src/helios/cteni.js";
import { cisloPu } from "../src/helios/sync.js";

function zakazka(zmeny: Partial<ZakazkaZHeliosu>): ZakazkaZHeliosu {
  return {
    c_zakazky: "Z1212600001",
    vin: null,
    spz: null,
    model: null,
    organizace: null,
    utvar: null,
    utvar_nazev: null,
    datum_prijeti: null,
    predpoklad_datum_dokonceni: null,
    stav_real: 30,
    stav_HeN: null,
    ...zmeny,
  };
}

describe("číslo pojistné události", () => {
  it("vezme alias i původní jméno sloupce z UDA", () => {
    expect(cisloPu(zakazka({ cislo_pojistne_udalosti: " 4201234567 " }))).toBe(
      "4201234567",
    );
    expect(cisloPu(zakazka({ ino_cpu: "PU-2026-1188" }))).toBe("PU-2026-1188");
  });

  it("číslo zadané v Heliosu jako číslo převede na text", () => {
    expect(cisloPu(zakazka({ ino_cpu: 4201234567 }))).toBe("4201234567");
  });

  it("prázdné je nevyplněné", () => {
    expect(cisloPu(zakazka({ ino_cpu: "  " }))).toBeNull();
    expect(cisloPu(zakazka({}))).toBeNull();
  });

  it("přehnaně dlouhou hodnotu ořízne, ať neshodí synchronizaci", () => {
    // UDA je volné pole - kdyby tam někdo vložil poznámku, upsert by
    // spadl na P2000 a nedotekla by žádná zakázka.
    expect(cisloPu(zakazka({ ino_cpu: "x".repeat(250) }))).toHaveLength(100);
  });
});
