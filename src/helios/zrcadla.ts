import { prisma } from "../db.js";
import {
  nactiKontakty,
  nactiKontaktyPodleId,
  nactiModely,
  nactiModelyPodleId,
  nactiOrganizace,
  nactiOrganizacePodleId,
  nactiVozidla,
  nactiVozidlaPodleId,
  type KontaktZHeliosu,
  type ModelZHeliosu,
  type OrganizaceZHeliosu,
  type VozidloZHeliosu,
} from "./cteni.js";
import {
  nactiPoCastech,
  ulozDavkove,
  type Radek,
  type Sloupec,
} from "./davka.js";
import { cislo, text } from "./prevod.js";

/**
 * Zrcadla vozidel, zákazníků, modelů a kontaktů.
 *
 * Běží ve dvou režimech, protože nové a změněné záznamy mají různou
 * naléhavost:
 *
 *   plný běh    jednou za noc (nebo ručně) opíše všechna čtyři zrcadla.
 *               Tím se propíší **změny** - nový telefon, přeznačené auto.
 *   doplnění    hned po každé synchronizaci zakázek dotáhne to, na co
 *               zakázky ukazují a my to ještě nemáme. Tím se řeší **nové**
 *               záznamy: zákazník, který přijel poprvé v deset dopoledne,
 *               nemá čekat do rána.
 *
 * Zrcadla se nikdy nemažou. Zákazník zrušený v Heliosu má zůstat čitelný
 * u svých starých zakázek.
 */

const KLIC = "cislo_subjektu";

const SLOUPCE_VOZIDLA: Sloupec[] = [
  { nazev: "cislo_subjektu", typ: "int" },
  { nazev: "reference_subjektu", typ: "nvarchar(50)" },
  { nazev: "nazev_subjektu", typ: "nvarchar(255)" },
  { nazev: "spz", typ: "nvarchar(30)" },
  { nazev: "vin", typ: "nvarchar(50)" },
  { nazev: "znackamodel", typ: "int" },
  { nazev: "majitel", typ: "int" },
  { nazev: "kontaktni_osoba", typ: "int" },
  { nazev: "stav_tachometru", typ: "int" },
  { nazev: "prodej_datum", typ: "datetime2" },
  { nazev: "videno_at", typ: "datetime2" },
];

const SLOUPCE_ORGANIZACE: Sloupec[] = [
  { nazev: "cislo_subjektu", typ: "int" },
  { nazev: "reference_subjektu", typ: "nvarchar(50)" },
  { nazev: "nazev_subjektu", typ: "nvarchar(255)" },
  { nazev: "ico", typ: "nvarchar(20)" },
  { nazev: "dic", typ: "nvarchar(30)" },
  { nazev: "ulice", typ: "nvarchar(255)" },
  { nazev: "cislo_cp", typ: "nvarchar(20)" },
  { nazev: "cislo_co", typ: "nvarchar(20)" },
  { nazev: "misto", typ: "nvarchar(255)" },
  { nazev: "psc", typ: "nvarchar(20)" },
  { nazev: "ulice_ds", typ: "nvarchar(255)" },
  { nazev: "telefon", typ: "nvarchar(60)" },
  { nazev: "email", typ: "nvarchar(255)" },
  { nazev: "videno_at", typ: "datetime2" },
];

const SLOUPCE_MODELY: Sloupec[] = [
  { nazev: "cislo_subjektu", typ: "int" },
  { nazev: "reference_subjektu", typ: "nvarchar(50)" },
  { nazev: "nazev_subjektu", typ: "nvarchar(255)" },
  { nazev: "serie", typ: "nvarchar(100)" },
  { nazev: "nazev_dlouhy", typ: "nvarchar(255)" },
  { nazev: "palivo", typ: "nvarchar(100)" },
  { nazev: "motor", typ: "nvarchar(255)" },
  { nazev: "videno_at", typ: "datetime2" },
];

const SLOUPCE_KONTAKTY: Sloupec[] = [
  { nazev: "cislo_subjektu", typ: "int" },
  { nazev: "jmeno", typ: "nvarchar(255)" },
  { nazev: "prijmeni", typ: "nvarchar(255)" },
  { nazev: "ulice_domu", typ: "nvarchar(255)" },
  { nazev: "misto_domu", typ: "nvarchar(255)" },
  { nazev: "psc_domu", typ: "nvarchar(20)" },
  { nazev: "email", typ: "nvarchar(255)" },
  { nazev: "telefon_mobil", typ: "nvarchar(60)" },
  { nazev: "videno_at", typ: "datetime2" },
];

function radekVozidla(v: VozidloZHeliosu, ted: Date): Radek {
  return {
    cislo_subjektu: v.cislo_subjektu,
    reference_subjektu: text(v.reference_subjektu),
    nazev_subjektu: text(v.nazev_subjektu),
    spz: text(v.spz),
    // V Heliosu `vyr_cislo_karoserie`.
    vin: text(v.vyr_cislo_karoserie),
    znackamodel: cislo(v.znackamodel),
    majitel: cislo(v.majitel),
    kontaktni_osoba: cislo(v.kontaktni_osoba),
    stav_tachometru: cislo(v.stav_tachometru),
    prodej_datum: v.prodej_datum,
    videno_at: ted,
  };
}

function radekOrganizace(o: OrganizaceZHeliosu, ted: Date): Radek {
  return {
    cislo_subjektu: o.cislo_subjektu,
    reference_subjektu: text(o.reference_subjektu),
    nazev_subjektu: text(o.nazev_subjektu),
    ico: text(o.ico),
    dic: text(o.dic),
    ulice: text(o.ulice),
    cislo_cp: text(o.cislo_cp),
    cislo_co: text(o.cislo_co),
    misto: text(o.misto),
    psc: text(o.psc),
    ulice_ds: text(o.ulice_ds),
    telefon: text(o.telefon),
    email: text(o.e_mail),
    videno_at: ted,
  };
}

function radekModelu(m: ModelZHeliosu, ted: Date): Radek {
  return {
    cislo_subjektu: m.cislo_subjektu,
    reference_subjektu: text(m.reference_subjektu),
    nazev_subjektu: text(m.nazev_subjektu),
    serie: text(m.serie),
    nazev_dlouhy: text(m.nazev_dlouhy),
    palivo: text(m.palivo),
    motor: text(m.motor),
    videno_at: ted,
  };
}

function radekKontaktu(k: KontaktZHeliosu, ted: Date): Radek {
  return {
    cislo_subjektu: k.cislo_subjektu,
    jmeno: text(k.jmeno),
    prijmeni: text(k.prijmeni),
    ulice_domu: text(k.ulice_domu),
    misto_domu: text(k.misto_domu),
    psc_domu: text(k.psc_domu),
    email: text(k.e_mail),
    telefon_mobil: text(k.telefon_mobil),
    videno_at: ted,
  };
}

export type PocetyZrcadel = {
  vozidla: number;
  organizace: number;
  modely: number;
  kontakty: number;
};

/**
 * Plný běh: všechna čtyři zrcadla celá, dohromady kolem 190 000 řádků.
 * Patří do noci nebo do ručního spuštění, ne do pětiminutového cyklu.
 */
export async function synchronizujZrcadla(): Promise<PocetyZrcadel> {
  const ted = new Date();

  // Postupně, ne najednou: čtyři souběžné dotazy přes linkovaný server by
  // Heliosu přitížily víc než čtyři za sebou a nic bychom tím nezískali.
  // Každá tabulka se po přečtení hned zapíše, ať v paměti neleží všechny.
  const vozidla = await ulozDavkove(
    "helios_vozidla",
    KLIC,
    SLOUPCE_VOZIDLA,
    (await nactiVozidla()).map((v) => radekVozidla(v, ted)),
  );

  const organizace = await ulozDavkove(
    "helios_organizace",
    KLIC,
    SLOUPCE_ORGANIZACE,
    (await nactiOrganizace()).map((o) => radekOrganizace(o, ted)),
  );

  const modely = await ulozDavkove(
    "helios_modely",
    KLIC,
    SLOUPCE_MODELY,
    (await nactiModely()).map((m) => radekModelu(m, ted)),
  );

  const kontakty = await ulozDavkove(
    "helios_kontakty",
    KLIC,
    SLOUPCE_KONTAKTY,
    (await nactiKontakty()).map((k) => radekKontaktu(k, ted)),
  );

  return { vozidla, organizace, modely, kontakty };
}

type Klic = { id: number | null };

function klice(radky: Klic[]): number[] {
  return radky.flatMap((r) => (r.id === null ? [] : [r.id]));
}

/**
 * Doplní, na co zakázky ukazují a my to nemáme.
 *
 * Řetězí se: nová zakázka přinese neznámé vozidlo, to přinese neznámého
 * majitele, kontaktní osobu a model. Proto se vozidla dotahují jako první
 * a teprve pak se hledá, co chybí k nim - jinak by každý článek řetězu
 * čekal na další běh synchronizace.
 *
 * Většinu běhů nenajde nic a skončí čtyřmi rychlými dotazy do naší
 * databáze, Heliosu se vůbec nedotkne.
 *
 * Jen pro **rozdělané** zakázky. Historie sahá roky zpátky a část odkazů
 * v ní vede na vozidla nebo zákazníky, kteří už v Heliosu nejsou. Ty by se
 * nikdy nenašly a doptávalo by se na ně každých pět minut pořád dokola.
 * Historické zakázky pokryje noční plný běh - co v něm není, v Heliosu
 * prostě neexistuje.
 */
export async function doplnChybejiciZrcadla(): Promise<PocetyZrcadel> {
  const ted = new Date();

  const idVozidel = klice(await prisma.$queryRaw<Klic[]>`
    select distinct z.vozidlo_id as id
    from helios_zakazky z
    left join helios_vozidla v on v.cislo_subjektu = z.vozidlo_id
    where z.je_aktivni = 1
      and z.vozidlo_id is not null and v.cislo_subjektu is null
  `);
  const vozidla = await ulozDavkove(
    "helios_vozidla",
    KLIC,
    SLOUPCE_VOZIDLA,
    (await nactiPoCastech(idVozidel, nactiVozidlaPodleId)).map((v) =>
      radekVozidla(v, ted),
    ),
  );

  // Zákazník může chybět ze dvou stran: jako zákazník zakázky, nebo jako
  // majitel vozu. U ojetého auta nového majitele to nemusí být tentýž.
  const idOrganizaci = klice(await prisma.$queryRaw<Klic[]>`
    select distinct s.id
    from (
      select organizace_id as id from helios_zakazky
      where je_aktivni = 1 and organizace_id is not null
      union
      select pojistovna_id as id from helios_zakazky
      where je_aktivni = 1 and pojistovna_id is not null
      union
      select v.majitel as id
      from helios_vozidla v
      join helios_zakazky z on z.vozidlo_id = v.cislo_subjektu and z.je_aktivni = 1
      where v.majitel is not null
    ) s
    left join helios_organizace o on o.cislo_subjektu = s.id
    where o.cislo_subjektu is null
  `);
  const organizace = await ulozDavkove(
    "helios_organizace",
    KLIC,
    SLOUPCE_ORGANIZACE,
    (await nactiPoCastech(idOrganizaci, nactiOrganizacePodleId)).map((o) =>
      radekOrganizace(o, ted),
    ),
  );

  const idModelu = klice(await prisma.$queryRaw<Klic[]>`
    select distinct v.znackamodel as id
    from helios_vozidla v
    join helios_zakazky z on z.vozidlo_id = v.cislo_subjektu and z.je_aktivni = 1
    left join helios_modely m on m.cislo_subjektu = v.znackamodel
    where v.znackamodel is not null and m.cislo_subjektu is null
  `);
  const modely = await ulozDavkove(
    "helios_modely",
    KLIC,
    SLOUPCE_MODELY,
    (await nactiPoCastech(idModelu, nactiModelyPodleId)).map((m) =>
      radekModelu(m, ted),
    ),
  );

  const idKontaktu = klice(await prisma.$queryRaw<Klic[]>`
    select distinct v.kontaktni_osoba as id
    from helios_vozidla v
    join helios_zakazky z on z.vozidlo_id = v.cislo_subjektu and z.je_aktivni = 1
    left join helios_kontakty k on k.cislo_subjektu = v.kontaktni_osoba
    where v.kontaktni_osoba is not null and k.cislo_subjektu is null
  `);
  const kontakty = await ulozDavkove(
    "helios_kontakty",
    KLIC,
    SLOUPCE_KONTAKTY,
    (await nactiPoCastech(idKontaktu, nactiKontaktyPodleId)).map((k) =>
      radekKontaktu(k, ted),
    ),
  );

  return { vozidla, organizace, modely, kontakty };
}
