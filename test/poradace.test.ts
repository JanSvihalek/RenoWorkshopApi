import { describe, expect, it } from "vitest";

import { poradacProApi } from "../src/domain/poradace.js";

describe("pořadač zakázky", () => {
  const poradace = new Map([[10026, "BMW BSL"]]);

  it("pošle kód a krátký název z převodní tabulky", () => {
    expect(poradacProApi(10026, poradace)).toEqual({
      code: "10026",
      label: "BMW BSL",
    });
  });

  it("neznámý pořadač nezahodí, jen ukáže číslo", () => {
    // V aplikaci je pak vidět, že v tabulce poradace chybí řádek.
    expect(poradacProApi(19999, poradace)).toEqual({
      code: "19999",
      label: "19999",
    });
  });

  it("zakázka bez pořadače je bez něj", () => {
    expect(poradacProApi(null, poradace)).toBeNull();
  });
});
