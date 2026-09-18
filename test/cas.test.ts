import { describe, expect, it } from "vitest";

import { mistniCas } from "../src/domain/cas.js";

/** Tak, jak čas vidí člověk u serveru. */
function mistniZapis(datum: Date): string {
  const dvoj = (n: number) => String(n).padStart(2, "0");
  return (
    `${datum.getFullYear()}-${dvoj(datum.getMonth() + 1)}-${dvoj(datum.getDate())}` +
    `T${dvoj(datum.getHours())}:${dvoj(datum.getMinutes())}:${dvoj(datum.getSeconds())}`
  );
}

describe("čas do databáze", () => {
  it("zapíše číslice místního času, ne UTC", () => {
    // Letní čas: v ČR 10:05 je 08:05 UTC. Do databáze i do odpovědi API
    // musí jít 10:05.
    const ted = new Date(2026, 8, 18, 10, 5, 30);
    expect(mistniCas(ted).toISOString().slice(0, 19)).toBe(mistniZapis(ted));
  });

  it("platí i v zimě, kdy je posun jiný", () => {
    const zimni = new Date(2027, 0, 15, 7, 45, 0);
    expect(mistniCas(zimni).toISOString().slice(0, 19)).toBe(
      mistniZapis(zimni),
    );
  });

  it("zachovává pořadí okamžiků", () => {
    const drive = mistniCas(new Date(2026, 8, 18, 10, 0, 0));
    const pozdeji = mistniCas(new Date(2026, 8, 18, 10, 0, 1));
    expect(pozdeji.getTime()).toBeGreaterThan(drive.getTime());
  });
});
