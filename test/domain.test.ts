import { describe, expect, it } from "vitest";

import {
  pobockaZUtvaru,
  utvarProApi,
  zkratNazevUtvaru,
} from "../src/domain/utvar.js";
import { jePlatnyPosun, jeUkoncena, vychoziStav } from "../src/domain/stav.js";
import { typProApi } from "../src/domain/typy.js";

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
    expect(jeUkoncena(50)).toBe(true); // Dokončeno
    expect(jeUkoncena(10)).toBe(true); // Nerealizuje se
  });

  it("K fakturaci na dílně zůstává, vůz ještě nikdo neodvezl", () => {
    expect(jeUkoncena(36)).toBe(false);
    expect(jeUkoncena(null)).toBe(false);
  });

  it("výchozí dílenský stav se odvodí z Heliosu", () => {
    expect(vychoziStav(42)).toBe("waiting_for_parts");
    expect(vychoziStav(30)).toBe("in_repair");
    expect(vychoziStav(36)).toBe("ready_for_pickup");
    expect(vychoziStav(20)).toBe("received");
    expect(vychoziStav(null)).toBe("received");
  });
});

describe("posun stavu", () => {
  it("povolí jen jeden krok dopředu", () => {
    expect(jePlatnyPosun("received", "diagnostics")).toBe(true);
    expect(jePlatnyPosun("received", "in_repair")).toBe(false);
    expect(jePlatnyPosun("in_repair", "diagnostics")).toBe(false);
    expect(jePlatnyPosun("picked_up", "picked_up")).toBe(false);
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
