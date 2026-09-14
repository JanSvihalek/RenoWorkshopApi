import { jeUkoncena } from "../domain/stav.js";
import { nactiHistoriiZakazek, type ZakazkaZHeliosu } from "./cteni.js";
import { ulozDavkove, type Radek, type Sloupec } from "./davka.js";
import { cislo, text } from "./prevod.js";
import { idHlavicky, radaReference } from "./sync.js";

/**
 * Historie zakázek: ukončené zakázky z Heliosu.
 *
 * Kvůli vyhledávání podle SPZ - k vozidlu se mají ukázat všechny jeho
 * zakázky napříč lety, ne jen ty, které jsme stihli zachytit rozdělané.
 *
 * Běží jednou za noc spolu se zrcadly. Ukončených zakázek jsou desítky tisíc,
 * pětiminutová synchronizace proto tahá jen rozdělané a o ukončené se
 * stará tahle.
 *
 * Rozdělení práce mezi oba běhy:
 *
 *   pětiminutový   rozdělané zakázky; **jen on** přepíná `je_aktivni`
 *                  a zapisuje `uzavrena_at`, když zakázka z rozdělaných
 *                  zmizí.
 *   noční          ukončené zakázky; údaje z Heliosu aktualizuje, ale
 *                  příznaků aktivity se u existující zakázky nedotkne.
 *                  Nové zakládá rovnou jako neaktivní.
 *
 * Kdyby noční běh sahal na `je_aktivni`, mohl by přepsat zakázku, která
 * se mezitím vrátila na dílnu (reklamace), nebo by jí smazal skutečné
 * datum uzavření.
 */

const SLOUPCE: Sloupec[] = [
  { nazev: "cislo_zakazky", typ: "nvarchar(40)" },
  { nazev: "spz", typ: "nvarchar(20)" },
  { nazev: "vin", typ: "nvarchar(30)" },
  { nazev: "model", typ: "nvarchar(200)" },
  { nazev: "zakaznik", typ: "nvarchar(200)" },
  { nazev: "utvar_kod", typ: "nvarchar(20)" },
  { nazev: "utvar_nazev", typ: "nvarchar(200)" },
  { nazev: "rada_reference", typ: "nvarchar(50)" },
  { nazev: "vozidlo_id", typ: "int" },
  { nazev: "organizace_id", typ: "int" },
  { nazev: "zakazka_id", typ: "int" },
  { nazev: "zodpovida_kod", typ: "nvarchar(50)" },
  { nazev: "zodpovida", typ: "nvarchar(200)" },
  { nazev: "datum_prijeti", typ: "datetime2" },
  { nazev: "termin_dokonceni", typ: "datetime2" },
  { nazev: "stav_real_cislo", typ: "int" },
  { nazev: "stav_real_nazev", typ: "nvarchar(100)" },
  // Patří pětiminutové synchronizaci - viz komentář nahoře.
  { nazev: "je_aktivni", typ: "bit", jenPriVlozeni: true },
  // Povinný sloupec. U existující zakázky znamená "kdy ji naposledy viděl
  // pětiminutový běh mezi rozdělanými" a na tom stojí označování uzavřených.
  { nazev: "videno_at", typ: "datetime2", jenPriVlozeni: true },
];

/** Řádek pro `helios_zakazky`. Exportováno kvůli testům. */
export function radekHistorie(z: ZakazkaZHeliosu, ted: Date): Radek {
  return {
    // Klíč schválně beze změny, přesně jak ho zapisuje pětiminutový běh.
    // Jinak by tatáž zakázka mohla vzniknout dvakrát.
    cislo_zakazky: z.c_zakazky,
    spz: text(z.spz),
    vin: text(z.vin),
    model: text(z.model),
    zakaznik: text(z.organizace),
    utvar_kod: text(z.utvar),
    utvar_nazev: text(z.utvar_nazev),
    rada_reference: radaReference(z),
    vozidlo_id: cislo(z.vozidlo_id),
    organizace_id: cislo(z.organizace_id),
    zakazka_id: idHlavicky(z),
    zodpovida_kod: text(z.zodpovida_kod),
    zodpovida: text(z.zodpovida),
    datum_prijeti: z.datum_prijeti,
    termin_dokonceni: z.predpoklad_datum_dokonceni,
    stav_real_cislo: cislo(z.stav_real),
    stav_real_nazev: text(z.stav_HeN),
    je_aktivni: 0,
    videno_at: ted,
  };
}

/**
 * Stáhne ukončené zakázky a zapíše je do `helios_zakazky`. Nic nemaže.
 *
 * Pojistka na filtr: kdyby pohled historie někdy vrátil i rozdělanou
 * zakázku, přeskočí se. Tu vede pětiminutový běh.
 */
export async function synchronizujHistorii(): Promise<{ pocet: number }> {
  const ted = new Date();

  const radky = (await nactiHistoriiZakazek())
    .filter((z) => z.c_zakazky && jeUkoncena(z.stav_real))
    .map((z) => radekHistorie(z, ted));

  const pocet = await ulozDavkove(
    "helios_zakazky",
    "cislo_zakazky",
    SLOUPCE,
    radky,
  );

  return { pocet };
}

/** Sloupce zápisu - kvůli testu, že noční běh nesahá na cizí příznaky. */
export const SLOUPCE_HISTORIE = SLOUPCE;
