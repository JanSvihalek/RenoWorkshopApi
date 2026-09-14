import { describe, expect, it } from "vitest";

import {
  pobockaZUtvaru,
  utvarProApi,
  zkratNazevUtvaru,
} from "../src/domain/utvar.js";
import { jeUkoncena } from "../src/domain/stav.js";
import { typProApi } from "../src/domain/typy.js";
import {
  celeJmeno,
  kodProHledani,
  uliceSCislem,
} from "../src/domain/vozidlo.js";

describe("pobočka z útvaru", () => {
  it("bere druhou číslici kódu", () => {
    expect(pobockaZUtvaru("11211")).toEqual({ code: "1", label: "Brno" });
    expect(pobockaZUtvaru("12211")).toEqual({ code: "2", label: "Čestlice" });
    expect(pobockaZUtvaru("13215")).toEqual({
      code: "3",
      label: "Kongresové Centrum",
    });
    expect(pobockaZUtvaru("14221")).toEqual({ code: "4", label: "Česká" });
  });

  it("nezařaditelný kód nebo chybějící útvar vrací null", () => {
    // 10005 = sdílené služby, druhá číslice 0 není pobočka.
    expect(pobockaZUtvaru("10005")).toBeNull();
    expect(pobockaZUtvaru(null)).toBeNull();
    expect(pobockaZUtvaru("")).toBeNull();
  });
});

describe("zkrácení názvu útvaru", () => {
  it("odřízne firmu, lokalitu a AFS", () => {
    expect(zkratNazevUtvaru("RAS BSL AFS auta Servis")).toBe("Auta Servis");
    expect(zkratNazevUtvaru("RAS NUP AFS auta Klempírna, lakovna")).toBe(
      "Auta Klempírna, lakovna",
    );
    expect(zkratNazevUtvaru("RAS CSK AFS MOTO Servis")).toBe("MOTO Servis");
    expect(zkratNazevUtvaru("RAS BSL prodej auta BMW")).toBe("Prodej auta BMW");
  });

  it("název bez kódu lokality nechá být", () => {
    expect(zkratNazevUtvaru("RAS sdílené služby majitelé")).toBe(
      "RAS sdílené služby majitelé",
    );
  });

  it("když název chybí, použije se kód", () => {
    expect(utvarProApi("12213", null)).toEqual({
      code: "12213",
      label: "12213",
    });
    expect(utvarProApi(null, "cokoli")).toBeNull();
  });
});

describe("stavy z Heliosu", () => {
  it("ukončené zakázky se přestanou zobrazovat", () => {
    expect(jeUkoncena(3)).toBe(true); // Ukončeno
    expect(jeUkoncena(10)).toBe(true); // Nerealizuje se
  });

  it("Dokončeno není ukončeno - na zakázce se pořád pracuje nebo čeká", () => {
    expect(jeUkoncena(50)).toBe(false);
  });

  it("K fakturaci na dílně zůstává, vůz ještě nikdo neodvezl", () => {
    expect(jeUkoncena(36)).toBe(false);
    expect(jeUkoncena(null)).toBe(false);
  });
});

describe("typ (řada) zakázky", () => {
  const typy = new Map([
    ["801", "Běžná"],
    ["802", "Interní"],
  ]);

  it("přeloží číslo řady na název", () => {
    expect(typProApi("801", typy)).toEqual({ code: "801", label: "Běžná" });
  });

  it("neznámé číslo pošle jako název samo sebe", () => {
    // Ať je v appce vidět, že do převodní tabulky přibyla práce -
    // zakázka se kvůli tomu nesmí ztratit.
    expect(typProApi("809", typy)).toEqual({ code: "809", label: "809" });
  });

  it("zakázka bez řady nemá typ", () => {
    expect(typProApi(null, typy)).toBeNull();
  });

  it("prázdný název v tabulce se chová jako chybějící", () => {
    expect(typProApi("803", new Map([["803", "   "]]))).toEqual({
      code: "803",
      label: "803",
    });
  });
});

describe("vozidlo", () => {
  it("SPZ z fotoaparátu a z Heliosu se porovnají stejně", () => {
    expect(kodProHledani("2BK 9485")).toBe("2BK9485");
    expect(kodProHledani("2bk-9485")).toBe("2BK9485");
    expect(kodProHledani(" wba 123 ")).toBe("WBA123");
  });

  it("ulice s číslem popisným i orientačním", () => {
    expect(uliceSCislem("Masarykova", "123", "4")).toBe("Masarykova 123/4");
    expect(uliceSCislem("Masarykova", "123", null)).toBe("Masarykova 123");
    expect(uliceSCislem("Masarykova", null, null)).toBe("Masarykova");
  });

  it("obec bez ulic dostane č. p.", () => {
    expect(uliceSCislem(null, "56", null)).toBe("č. p. 56");
    expect(uliceSCislem(null, null, null)).toBeNull();
  });

  it("jméno kontaktní osoby i s chybějící částí", () => {
    expect(celeJmeno("Jan", "Novák")).toBe("Jan Novák");
    expect(celeJmeno(null, "Novák")).toBe("Novák");
    expect(celeJmeno(null, null)).toBeNull();
  });
});
