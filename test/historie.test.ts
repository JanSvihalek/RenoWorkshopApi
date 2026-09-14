import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { ZakazkaZHeliosu } from "../src/helios/cteni.js";
import { sestavDavky } from "../src/helios/davka.js";
import { radekHistorie, SLOUPCE_HISTORIE } from "../src/helios/historie.js";

function zakazka(zmeny: Partial<ZakazkaZHeliosu> = {}): ZakazkaZHeliosu {
  return {
    c_zakazky: "Z12126000123",
    vin: "WBA12345678901234",
    spz: "2BK 9485",
    model: "BMW 320d",
    organizace: "Petr Novák",
    utvar: "11211",
    utvar_nazev: "Servis Brno",
    datum_prijeti: new Date("2023-03-01T08:00:00"),
    predpoklad_datum_dokonceni: new Date("2023-03-03T15:00:00"),
    stav_real: 3,
    stav_HeN: "Ukončeno",
    zakazka_rada: "801",
    zodpovida_kod: "T042",
    zodpovida: "Jan Dvořák",
    vozidlo_id: 51234,
    organizace_id: 60001,
    ...zmeny,
  };
}

describe("historie zakázek", () => {
  it("noční běh nepřepíše příznaky, které řídí pětiminutový", () => {
    // Zakázka se mohla mezitím vrátit na dílnu (reklamace). Kdyby noční běh
    // přepsal je_aktivni, zmizela by ze seznamu, i když auto stojí u zvedáku.
    const [prikaz] = sestavDavky(
      "helios_zakazky",
      "cislo_zakazky",
      SLOUPCE_HISTORIE,
      [radekHistorie(zakazka(), new Date())],
    );
    const [, aktualizace, vlozeni] = prikaz!.sql.split(
      /when matched then update set|when not matched then insert/,
    );

    expect(aktualizace).not.toContain("[je_aktivni]");
    expect(aktualizace).not.toContain("[videno_at]");
    // Nová zakázka ale neaktivní vzniknout musí, jinak by vyskočila v seznamu.
    expect(vlozeni).toContain("[je_aktivni]");
    expect(vlozeni).toContain("[videno_at]");
  });

  it("na datum uzavření a stání nesahá vůbec", () => {
    const nazvy = SLOUPCE_HISTORIE.map((s) => s.nazev);
    expect(nazvy).not.toContain("uzavrena_at");
    expect(nazvy).not.toContain("stani");
  });

  it("číslo zakázky nechá beze změny, ať nevznikne podruhé", () => {
    const radek = radekHistorie(zakazka({ c_zakazky: "Z121260001 " }), new Date());
    // Pětiminutový běh zapisuje c_zakazky tak, jak přišlo. Ořezaný klíč by
    // se s ním nespároval a zakázka by v databázi byla dvakrát.
    expect(radek.cislo_zakazky).toBe("Z121260001 ");
  });

  it("pojišťovnu vezme jako číslo organizace", () => {
    const radek = radekHistorie(zakazka({ pojistovna1: "60001" }), new Date());
    expect(radek.pojistovna_id).toBe(60001);
    expect(radekHistorie(zakazka(), new Date()).pojistovna_id).toBeNull();
  });

  it("nová zakázka z historie je neaktivní", () => {
    expect(radekHistorie(zakazka(), new Date()).je_aktivni).toBe(0);
  });

  it("šířky sloupců odpovídají schématu databáze", () => {
    // Kdyby se rozešly, text by se buď zkracoval zbytečně, nebo by ho SQL
    // Server odmítl a spadla by celá dávka.
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const model = /model HeliosZakazka \{([\s\S]*?)\n\}/.exec(schema)![1]!;

    for (const sloupec of SLOUPCE_HISTORIE) {
      const sirka = /^nvarchar\((\d+)\)$/.exec(sloupec.typ)?.[1];
      if (!sirka) continue;

      const radek = model
        .split("\n")
        .find((r) => {
          const map = /@map\("([^"]+)"\)/.exec(r)?.[1];
          const pole = /^\s*(\w+)\s/.exec(r)?.[1];
          return (map ?? pole) === sloupec.nazev && r.includes("@db.NVarChar");
        });

      expect(radek, `sloupec ${sloupec.nazev} ve schématu`).toBeDefined();
      expect(radek).toContain(`@db.NVarChar(${sirka})`);
    }
  });
});

describe("zkrácení textu na šířku sloupce", () => {
  it("dlouhý text zkrátí, místo aby shodil celou dávku", () => {
    const [prikaz] = sestavDavky(
      "helios_zakazky",
      "cislo_zakazky",
      [
        { nazev: "cislo_zakazky", typ: "nvarchar(40)" },
        { nazev: "spz", typ: "nvarchar(20)" },
      ],
      [{ cislo_zakazky: "Z1", spz: "2BK 9485 - pozor, přeznačeno z 1AB 2345" }],
    );

    expect(prikaz!.values).toEqual(["Z1", "2BK 9485 - pozor, př"]);
  });

  it("text v mezích a čísla nechá být", () => {
    const [prikaz] = sestavDavky(
      "helios_vozidla",
      "cislo_subjektu",
      [
        { nazev: "cislo_subjektu", typ: "int" },
        { nazev: "spz", typ: "nvarchar(30)" },
      ],
      [{ cislo_subjektu: 123456789, spz: "2BK 9485" }],
    );

    expect(prikaz!.values).toEqual([123456789, "2BK 9485"]);
  });
});
