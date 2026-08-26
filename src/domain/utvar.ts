/**
 * Útvar a pobočka.
 *
 * Helios vede u zakázky jen útvar - pětimístný kód typu `12211`
 * (`subjekty.reference_subjektu`). Pobočka se z něj odvozuje **druhou
 * číslicí**. Odvození je schválně tady na serveru: kdyby přibyla pobočka
 * nebo se pravidlo změnilo, nemusí se kvůli tomu vydávat nová verze
 * mobilní aplikace.
 */

/** Druhá číslice útvaru -> název pobočky. */
const POBOCKY: Record<string, string> = {
  '1': 'Brno',
  '2': 'Čestlice',
  '3': 'Kongresové Centrum',
  '4': 'Česká',
  '5': 'Bubeneč',
};

export type Pobocka = { code: string; label: string };
export type Utvar = { code: string; label: string };

/**
 * Pobočka podle druhé číslice útvaru, nebo `null`, když se zařadit nedá.
 *
 * Zakázka bez pobočky se nezahazuje - aplikace ji ukáže jako „Bez pobočky".
 * V datech takové jsou, například útvar `10005` (sdílené služby).
 */
export function pobockaZUtvaru(utvar: string | null | undefined): Pobocka | null {
  if (!utvar) return null;
  const cislice = utvar.trim()[1];
  if (!cislice) return null;
  const label = POBOCKY[cislice];
  return label ? { code: cislice, label } : null;
}

/**
 * Zkrácení názvu útvaru pro mobilní aplikaci.
 *
 * Helios vede názvy jako `RAS BSL AFS auta Servis`, kde `RAS` je firma,
 * `BSL` lokalita a `AFS` interní zkratka. Na displeji telefonu je pobočka
 * vidět vedle, takže tahle část jen zabírá místo:
 *
 *   RAS BSL AFS auta Servis             -> Auta Servis
 *   RAS NUP AFS auta Klempírna, lakovna -> Auta Klempírna, lakovna
 *   RAS CSK AFS MOTO Servis             -> MOTO Servis
 *   RAS sdílené služby majitelé         -> beze změny (nemá kód lokality)
 */
export function zkratNazevUtvaru(nazev: string | null | undefined): string | null {
  if (!nazev) return null;
  const orezany = nazev.trim();
  if (!orezany) return null;
  const zbytek = orezany.replace(/^RAS\s+[A-ZČŘŠŽ]{3}\s+(AFS\s+)?/u, '');
  return zbytek.charAt(0).toUpperCase() + zbytek.slice(1);
}

/** Útvar pro odpověď API, nebo `null` u zakázky bez zpracovatele. */
export function utvarProApi(
  code: string | null | undefined,
  nazev: string | null | undefined,
): Utvar | null {
  if (!code) return null;
  const kod = code.trim();
  if (!kod) return null;
  return { code: kod, label: zkratNazevUtvaru(nazev) ?? kod };
}
