/**
 * Příjem vozidla - checklist, co má technik při příjmu na voze zkontrolovat.
 *
 * Kontroly jsou v číselníku (`prijem_kontroly_ciselnik`), vyplněné body
 * u příjmu zakázky (`prijem_polozky`). Příjem jde dokončit, jen když je
 * vyplněná každá aktivní kontrola.
 *
 * Bez databáze, ať jdou pravidla testovat.
 */

/** `kontrola` = zaškrtnout, `datum` = zapsat datum (platnost STK). */
export type TypKontroly = "kontrola" | "datum";

export interface KontrolaCiselniku {
  kod: string;
  nazev: string;
  typ: string;
}

export interface UlozenaPolozka {
  kod: string;
  nazev: string;
  typ: string;
  splneno: boolean;
  hodnota: string | null;
  poznamka: string | null;
  zmenilKdo: string | null;
  zmenenoAt: Date;
}

export interface PolozkaPrijmu {
  kod: string;
  nazev: string;
  typ: TypKontroly;
  splneno: boolean;
  hodnota: string | null;
  poznamka: string | null;
  zmenilKdo: string | null;
  zmenenoAt: Date | null;
  /** Aktivní kontrola z číselníku - bez ní příjem nejde dokončit. */
  povinna: boolean;
}

export function typKontroly(typ: string): TypKontroly {
  return typ === "datum" ? "datum" : "kontrola";
}

/** Datum ve tvaru RRRR-MM-DD, které v kalendáři existuje. */
export function jePlatneDatum(hodnota: string | null | undefined): boolean {
  const casti = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hodnota ?? "");
  if (!casti) return false;
  const rok = Number(casti[1]);
  const mesic = Number(casti[2]);
  const den = Number(casti[3]);
  const datum = new Date(Date.UTC(rok, mesic - 1, den));
  return (
    datum.getUTCFullYear() === rok &&
    datum.getUTCMonth() === mesic - 1 &&
    datum.getUTCDate() === den
  );
}

/**
 * Checklist příjmu: aktivní kontroly v pořadí číselníku doplněné o to, co
 * technik vyplnil. Vyplněná položka kontroly, která byla mezitím vyřazena,
 * zůstane na konci - co se při příjmu potvrdilo, nemá zmizet.
 *
 * @param ciselnik aktivní kontroly, už seřazené
 */
export function polozkyPrijmu(
  ciselnik: readonly KontrolaCiselniku[],
  ulozene: readonly UlozenaPolozka[],
): PolozkaPrijmu[] {
  const podleKodu = new Map(ulozene.map((p) => [p.kod, p]));
  const aktivni = ciselnik.map((kontrola): PolozkaPrijmu => {
    const ulozena = podleKodu.get(kontrola.kod);
    return {
      kod: kontrola.kod,
      nazev: kontrola.nazev,
      typ: typKontroly(kontrola.typ),
      splneno: ulozena?.splneno ?? false,
      hodnota: ulozena?.hodnota ?? null,
      poznamka: ulozena?.poznamka ?? null,
      zmenilKdo: ulozena?.zmenilKdo ?? null,
      zmenenoAt: ulozena?.zmenenoAt ?? null,
      povinna: true,
    };
  });
  const vCiselniku = new Set(ciselnik.map((k) => k.kod));
  const vyrazene = ulozene
    .filter((p) => !vCiselniku.has(p.kod))
    .map(
      (p): PolozkaPrijmu => ({
        ...p,
        typ: typKontroly(p.typ),
        povinna: false,
      }),
    );
  return [...aktivni, ...vyrazene];
}

/** Je položka vyplněná tak, jak její typ vyžaduje? */
export function jeVyplnena(polozka: PolozkaPrijmu): boolean {
  return polozka.typ === "datum"
    ? jePlatneDatum(polozka.hodnota)
    : polozka.splneno;
}

/** Povinné položky, které ještě nejsou vyplněné. */
export function chybejici(polozky: readonly PolozkaPrijmu[]): PolozkaPrijmu[] {
  return polozky.filter((p) => p.povinna && !jeVyplnena(p));
}

export type StavPrijmu = "not_started" | "in_progress" | "completed";

export function stavPrijmu(
  prijem: { dokoncenoAt: Date | null } | null,
): StavPrijmu {
  if (!prijem) return "not_started";
  return prijem.dokoncenoAt ? "completed" : "in_progress";
}
