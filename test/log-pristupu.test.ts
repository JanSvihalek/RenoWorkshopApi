import { describe, expect, it } from "vitest";

import {
  chybaZOdpovedi,
  MAX_CHYBA,
  zaznamPristupu,
  type VstupZaznamu,
} from "../src/domain/log-pristupu.js";

const vstup = (zmena: Partial<VstupZaznamu> = {}): VstupZaznamu => ({
  metoda: "PUT",
  cesta: "/api/orders/:id/intake/items/:kod",
  parametry: { id: "Z1212600123", kod: "brzdy" },
  stav: 200,
  trvaniMs: 41.6,
  email: "jan.dvorak@renocar.cz",
  uid: "abc",
  ip: "10.1.2.3",
  chyba: null,
  ...zmena,
});

describe("záznam přístupu", () => {
  it("číslo zakázky zvlášť, ostatní parametry vedle", () => {
    const zaznam = zaznamPristupu(vstup());
    expect(zaznam.zakazka).toBe("Z1212600123");
    expect(zaznam.parametry).toBe("kod=brzdy");
    expect(zaznam.trvaniMs).toBe(42);
    expect(zaznam.email).toBe("jan.dvorak@renocar.cz");
  });

  it("hledaný text z query se neukládá", () => {
    const zaznam = zaznamPristupu(
      vstup({
        metoda: "GET",
        cesta: "/api/orders/search?q=Petr%20Nov%C3%A1k",
        parametry: {},
      }),
    );
    expect(zaznam.cesta).toBe("/api/orders/search");
    expect(JSON.stringify(zaznam)).not.toContain("Nov");
  });

  it("u fotky ani vozidla se id nevydává za zakázku", () => {
    const fotka = zaznamPristupu(
      vstup({ cesta: "/api/photos/:id", parametry: { id: "f1" } }),
    );
    expect(fotka.zakazka).toBeNull();
    expect(fotka.parametry).toBe("id=f1");
  });

  it("nepřihlášený požadavek se zapíše bez uživatele", () => {
    const zaznam = zaznamPristupu(
      vstup({ email: null, uid: null, stav: 401, parametry: undefined }),
    );
    expect(zaznam.email).toBeNull();
    expect(zaznam.parametry).toBeNull();
    expect(zaznam.stav).toBe(401);
  });

  it("dlouhé hodnoty se oříznou na šířku sloupců", () => {
    const zaznam = zaznamPristupu(vstup({ chyba: "x".repeat(5000) }));
    expect(zaznam.chyba).toHaveLength(MAX_CHYBA);
  });
});

describe("chyba z odpovědi", () => {
  it("vezme kód a zprávu služby", () => {
    expect(
      chybaZOdpovedi(
        JSON.stringify({
          error: { code: "intake_completed", message: "Příjem je dokončený." },
        }),
      ),
    ).toBe("intake_completed: Příjem je dokončený.");
  });

  it("vezme zprávu nečekané chyby Fastify", () => {
    expect(
      chybaZOdpovedi(
        JSON.stringify({ statusCode: 500, message: "Connection timeout" }),
      ),
    ).toBe("Connection timeout");
  });

  it("jiné tělo neshodí log", () => {
    expect(chybaZOdpovedi("<html>")).toBeNull();
    expect(chybaZOdpovedi(undefined)).toBeNull();
    expect(chybaZOdpovedi(Buffer.from([1, 2]))).toBeNull();
  });
});
