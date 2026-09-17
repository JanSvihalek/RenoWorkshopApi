/**
 * Log přístupů - kdo, kdy a na co se ve službě ptal.
 *
 * Účel je bezpečnost a dohledání chyb („technikovi v 10:05 nešla uložit
 * poznámka"), ne hodnocení lidí. Proto se neukládá obsah požadavků (text
 * poznámek, fotky ani hledaný text), jen co se volalo, u které zakázky
 * a jak to dopadlo. Záznamy starší než `LOG_UCHOVANI_DNI` se v noci mažou.
 *
 * Bez databáze, ať jdou pravidla testovat.
 */

export const MAX_CHYBA = 2000;

export interface VstupZaznamu {
  metoda: string;
  /** Vzor routy (`/api/orders/:id`), nebo cesta, když routa neexistuje. */
  cesta: string;
  parametry: unknown;
  stav: number;
  trvaniMs: number;
  email: string | null;
  uid: string | null;
  ip: string | null;
  chyba: string | null;
}

export interface ZaznamPristupu {
  metoda: string;
  cesta: string;
  zakazka: string | null;
  parametry: string | null;
  stav: number;
  trvaniMs: number;
  email: string | null;
  uid: string | null;
  ip: string | null;
  chyba: string | null;
}

const orez = (text: string | null, delka: number) =>
  text === null ? null : text.slice(0, delka);

/**
 * Řádek logu z požadavku. Ze skutečné URL se bere jen cesta bez query -
 * v query je hledaný text (SPZ, jméno zákazníka), ten do logu nepatří.
 */
export function zaznamPristupu(vstup: VstupZaznamu): ZaznamPristupu {
  const cesta = vstup.cesta.split("?")[0] ?? vstup.cesta;
  const parametry =
    vstup.parametry && typeof vstup.parametry === "object"
      ? (vstup.parametry as Record<string, unknown>)
      : {};

  // Číslo zakázky zvlášť, ať jde snadno dohledat „co se dělo se zakázkou".
  const jeZakazka = /^\/api\/orders\/:id(\/|$)/.test(cesta);
  const zakazka =
    jeZakazka && typeof parametry.id === "string" ? parametry.id : null;
  const ostatni = Object.entries(parametry)
    .filter(([klic]) => !(jeZakazka && klic === "id"))
    .map(([klic, hodnota]) => `${klic}=${String(hodnota)}`)
    .join(" ");

  return {
    metoda: vstup.metoda.slice(0, 10),
    cesta: cesta.slice(0, 200),
    zakazka: orez(zakazka, 40),
    parametry: ostatni.length > 0 ? ostatni.slice(0, 200) : null,
    stav: vstup.stav,
    trvaniMs: Math.max(0, Math.round(vstup.trvaniMs)),
    email: orez(vstup.email, 200),
    uid: orez(vstup.uid, 128),
    ip: orez(vstup.ip, 64),
    chyba: orez(vstup.chyba, MAX_CHYBA),
  };
}

/**
 * Chybová zpráva z těla odpovědi. Služba vrací `{error: {message}}`,
 * Fastify u nečekané chyby `{message}`. Jiné tělo = `null`.
 */
export function chybaZOdpovedi(telo: unknown): string | null {
  if (typeof telo !== "string" || telo.length === 0) return null;
  try {
    const json: unknown = JSON.parse(telo);
    if (!json || typeof json !== "object") return null;
    const zaznam = json as { error?: unknown; message?: unknown };
    if (zaznam.error && typeof zaznam.error === "object") {
      const { code, message } = zaznam.error as {
        code?: unknown;
        message?: unknown;
      };
      if (typeof message === "string") {
        return typeof code === "string" ? `${code}: ${message}` : message;
      }
    }
    return typeof zaznam.message === "string" ? zaznam.message : null;
  } catch {
    return null;
  }
}
