import { describe, expect, it } from "vitest";

import type { ZakazkaZHeliosu } from "../src/helios/cteni.js";
import { idHlavicky } from "../src/helios/sync.js";
import { radekZavady } from "../src/helios/zavady.js";

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

describe("klíč hlavičky zakázky", () => {
  it("vezme zakazka_id i původní cislo_subjektu z Heliosu", () => {
    expect(idHlavicky(zakazka({ zakazka_id: 812345 }))).toBe(812345);
    expect(idHlavicky(zakazka({ cislo_subjektu: 812345 }))).toBe(812345);
    expect(idHlavicky(zakazka({ cislo_subjektu: "812345" }))).toBe(812345);
  });

  it("bez klíče je zakázka bez závad, ne chyba", () => {
    expect(idHlavicky(zakazka({}))).toBeNull();
  });
});

describe("závada", () => {
  it("převede řádek z Heliosu", () => {
    const ted = new Date("2026-09-14T10:00:00");
    expect(
      radekZavady(
        {
          cislo_subjektu: 9001,
          reference_subjektu: " 001 ",
          nazev_subjektu: " Zadní nárazník ",
          poznamka: "  Vyměnit zadní nárazník\nlakovat do barvy  ",
          zakazka: 812345,
        },
        ted,
      ),
    ).toEqual({
      cislo_subjektu: 9001,
      zakazka: 812345,
      reference_subjektu: "001",
      nazev_subjektu: "Zadní nárazník",
      // Okraje pryč, zalomení uvnitř zůstává - poradce tak závadu napsal.
      poznamka: "Vyměnit zadní nárazník\nlakovat do barvy",
      videno_at: ted,
    });
  });

  it("prázdná poznámka je nevyplněná", () => {
    const radek = radekZavady(
      { cislo_subjektu: 1, reference_subjektu: null, poznamka: "  ", zakazka: 2 },
      new Date(),
    );
    expect(radek.poznamka).toBeNull();
  });
});
