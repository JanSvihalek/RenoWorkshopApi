import path from "node:path";

/**
 * Fotodokumentace zakázky - kam se fotka uloží.
 *
 * Fotky neleží na RENDCAPPu, ale ve sdílené složce na souborovém serveru
 * (`FOTO_ADRESAR`, dnes \\renocar.local\share\Foto-doc). Telefon na ni
 * nesahá - posílá fotku službě a ta ji uloží:
 *
 *   <FOTO_ADRESAR>\<pobočka>\<číslo zakázky>\<kategorie>\<čas>-<id>.jpg
 *
 * Pobočka je složka podle pořadače zakázky (tabulka `poradace`, sloupec
 * `slozka`). Kolegové tak fotky najdou i z počítače, bez aplikace.
 *
 * Bez databáze, ať jdou pravidla testovat.
 */

/** Kategorie fotek a jejich složky. Klíč chodí z aplikace. */
export const KATEGORIE_FOTEK = {
  exterier: "Exterier",
  poskozeni: "Poskozeni",
  kola: "Disky-a-kola",
  stk: "Nalepka-STK",
  interier: "Interier",
  tachometr: "Tachometr",
  vin: "VIN",
  ostatni: "Ostatni",
} as const;

export type KategorieFotky = keyof typeof KATEGORIE_FOTEK;

export function jeKategorie(hodnota: unknown): hodnota is KategorieFotky {
  return typeof hodnota === "string" && Object.hasOwn(KATEGORIE_FOTEK, hodnota);
}

/** Složka pro zakázku, u které se pobočka nedá určit. */
export const NEZARAZENO = "Nezarazeno";

/**
 * Jméno složky bezpečné pro sdílenou složku Windows. Cokoli mimo písmena,
 * číslice, tečku, pomlčku a podtržítko se nahradí pomlčkou; tečky na
 * začátku pryč, ať nevznikne `..` ani skrytá složka.
 *
 * Číslo zakázky i složka pobočky jdou do cesty - kdyby tu šlo protlačit
 * `..\..\`, šlo by zapisovat mimo Foto-doc.
 */
export function bezpecnyNazev(hodnota: string): string {
  const cisty = hodnota
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "")
    .replace(/[.-]+$/, "");
  return cisty.length > 0 ? cisty.slice(0, 80) : NEZARAZENO;
}

/**
 * Relativní cesta fotky vůči `FOTO_ADRESAR`. Ukládá se do databáze
 * relativně, ať se dá úložiště přestěhovat změnou jedné proměnné.
 */
export function relativniCesta(options: {
  slozkaPobocky: string | null;
  cisloZakazky: string;
  kategorie: KategorieFotky;
  cas: Date;
  id: string;
}): string {
  const { slozkaPobocky, cisloZakazky, kategorie, cas, id } = options;
  const dvoj = (n: number) => String(n).padStart(2, "0");
  const razitko =
    `${cas.getFullYear()}${dvoj(cas.getMonth() + 1)}${dvoj(cas.getDate())}` +
    `-${dvoj(cas.getHours())}${dvoj(cas.getMinutes())}${dvoj(cas.getSeconds())}`;

  return path.join(
    slozkaPobocky ? bezpecnyNazev(slozkaPobocky) : NEZARAZENO,
    bezpecnyNazev(cisloZakazky),
    KATEGORIE_FOTEK[kategorie],
    `${razitko}-${bezpecnyNazev(id).slice(-8)}.jpg`,
  );
}

/**
 * Plná cesta k souboru, nebo `null`, kdyby relativní cesta mířila mimo
 * úložiště. Pojistka i pro cesty, které přijdou z databáze.
 */
export function plnaCesta(koren: string, relativni: string): string | null {
  const zaklad = path.resolve(koren);
  const cil = path.resolve(zaklad, relativni);
  const uvnitr =
    cil === zaklad || cil.startsWith(zaklad.endsWith(path.sep) ? zaklad : zaklad + path.sep);
  return uvnitr && cil !== zaklad ? cil : null;
}

/** JPEG začíná bajty FF D8 FF - telefon nemá poslat nic jiného. */
export function jeJpeg(data: Buffer): boolean {
  return data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
}
