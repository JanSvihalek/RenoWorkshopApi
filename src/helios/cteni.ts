import { Prisma } from "@prisma/client";

import { prisma } from "../db.js";

/**
 * Čtení zakázek z Heliosu.
 *
 * Pohledy `v_renoworkshop_*` leží v databázi RenoWorkshop na RENDCAPPu
 * a přes **linkovaný server** sahají do Heliosu. Díky tomu stačí službě
 * jedno připojení - stejné, přes které zapisuje vlastní tabulky.
 *
 * Do Heliosu se jen čte - a hlídá to zatím jen tenhle kód: všechno tady
 * je `select` z pohledů. Záměr je, aby zápis nedovolila ani práva vzdáleného
 * účtu na Heliosu; to není ověřené, viz docs/PROVOZ.md.
 */

export type ZakazkaZHeliosu = {
  c_zakazky: string;
  vin: string | null;
  spz: string | null;
  model: string | null;
  organizace: string | null;
  utvar: string | null;
  utvar_nazev: string | null;
  datum_prijeti: Date | null;
  predpoklad_datum_dokonceni: Date | null;
  stav_real: number | null;
  stav_HeN: string | null;
  /**
   * Číslo řady zakázky (`801` běžná, `802` interní, `803` PDI...).
   * V pohledu je to `rada.reference_subjektu`. Název se k němu dohledává
   * v naší tabulce `typy_zakazek`.
   *
   * Nepovinné schválně: dotaz je `select *`, takže dokud pohled sloupec
   * nevrací, prostě chybí a synchronizace běží dál. Odpadá tím starost,
   * jestli se dřív nasadí služba, nebo upraví pohled.
   */
  zakazka_rada?: string | number | null;

  /**
   * Kdo za zakázku zodpovídá - kód a jméno z `subjekty`. Nepovinné jako
   * ostatní pozdější doplňky: dokud je pohled nevrací, chybí a nic se
   * nerozbije.
   */
  zodpovida_kod?: string | null;
  zodpovida?: string | null;

  /**
   * `cislo_subjektu` vozidla a organizace z Heliosu. Pohled je zná odjakživa
   * (joinuje se přes ně na `ino_vozidlo` a `organizace`), jen je nevracel.
   * Nepovinné jako ostatní doplňky - dokud je pohled neposílá, zakázka je
   * nemá a nic se nerozbije.
   */
  vozidlo_id?: number | string | null;
  organizace_id?: number | string | null;
};

export async function nactiZakazky(): Promise<ZakazkaZHeliosu[]> {
  return prisma.$queryRaw<ZakazkaZHeliosu[]>`
    select * from dbo.v_renoworkshop_zakazky
  `;
}

/**
 * Ukončené zakázky z pohledu `v_renoworkshop_zakazky_historie`. Stejné
 * sloupce jako rozdělané, jen jiný filtr stavu - kolem 70 000 řádků,
 * proto se čtou jednou za noc, ne každých pět minut.
 */
export async function nactiHistoriiZakazek(): Promise<ZakazkaZHeliosu[]> {
  return prisma.$queryRaw<ZakazkaZHeliosu[]>`
    select * from dbo.v_renoworkshop_zakazky_historie
  `;
}

/**
 * Zákazník z pohledu `v_renoworkshop_organizace`. Jména sloupců jsou
 * z Heliosu, ne naše - pohled je jen propouští.
 */
export type OrganizaceZHeliosu = {
  cislo_subjektu: number;
  reference_subjektu: string | null;
  nazev_subjektu: string | null;
  ico: string | null;
  dic: string | null;
  ulice: string | null;
  misto: string | null;
  psc: string | null;
  telefon: string | null;
  e_mail: string | null;
  // Číslo popisné a orientační bývá v Heliosu číslo, ale nemusí ("12a").
  cislo_co: string | number | null;
  cislo_cp: string | number | null;
  ulice_ds: string | null;
};

/** Všichni zákazníci. Pohled nefiltruje, tabulka se opisuje celá. */
export async function nactiOrganizace(): Promise<OrganizaceZHeliosu[]> {
  return prisma.$queryRaw<OrganizaceZHeliosu[]>`
    select * from dbo.v_renoworkshop_organizace
  `;
}

/**
 * Jen vyjmenovaní zákazníci - pro doplnění nových hned po synchronizaci
 * zakázek, aby se na ně nečekalo do nočního běhu.
 *
 * Podmínka se propíše až na Helios, protože pohled je prostý opis jedné
 * tabulky. Kdyby v něm někdy přibylo `distinct` nebo agregace, přestalo
 * by to platit a přes linkovaný server by se tahala celá tabulka.
 */
export async function nactiOrganizacePodleId(
  id: number[],
): Promise<OrganizaceZHeliosu[]> {
  if (id.length === 0) return [];
  return prisma.$queryRaw<OrganizaceZHeliosu[]>`
    select * from dbo.v_renoworkshop_organizace
    where cislo_subjektu in (${Prisma.join(id)})
  `;
}

/**
 * Vozidlo z pohledu `v_renoworkshop_vozidlo`. `vyr_cislo_karoserie` je VIN,
 * `znackamodel`, `majitel` a `kontaktni_osoba` jsou klíče do dalších zrcadel.
 */
export type VozidloZHeliosu = {
  cislo_subjektu: number;
  reference_subjektu: string | null;
  nazev_subjektu: string | null;
  spz: string | null;
  vyr_cislo_karoserie: string | null;
  znackamodel: number | null;
  majitel: number | null;
  kontaktni_osoba: number | null;
  stav_tachometru: number | string | null;
  prodej_datum: Date | null;
};

/** Všechna vozidla. Pohled nefiltruje, tabulka se opisuje celá. */
export async function nactiVozidla(): Promise<VozidloZHeliosu[]> {
  return prisma.$queryRaw<VozidloZHeliosu[]>`
    select * from dbo.v_renoworkshop_vozidlo
  `;
}

/** Jen vyjmenovaná vozidla - doplnění nových hned po synchronizaci zakázek. */
export async function nactiVozidlaPodleId(
  id: number[],
): Promise<VozidloZHeliosu[]> {
  if (id.length === 0) return [];
  return prisma.$queryRaw<VozidloZHeliosu[]>`
    select * from dbo.v_renoworkshop_vozidlo
    where cislo_subjektu in (${Prisma.join(id)})
  `;
}

/** Značka a model z pohledu `v_renoworkshop_model`. */
export type ModelZHeliosu = {
  cislo_subjektu: number;
  reference_subjektu: string | null;
  nazev_subjektu: string | null;
  serie: string | null;
  nazev_dlouhy: string | null;
  palivo: string | null;
  motor: string | null;
};

/**
 * Celý číselník značek a modelů. Je malý a mění se výjimečně, takže se
 * tahá vždycky celý a nedoptáváme se na jednotlivé řádky.
 */
export async function nactiModely(): Promise<ModelZHeliosu[]> {
  return prisma.$queryRaw<ModelZHeliosu[]>`
    select * from dbo.v_renoworkshop_model
  `;
}

/** Jen vyjmenované modely - kdyby mezi nočními běhy přibyl nový. */
export async function nactiModelyPodleId(
  id: number[],
): Promise<ModelZHeliosu[]> {
  if (id.length === 0) return [];
  return prisma.$queryRaw<ModelZHeliosu[]>`
    select * from dbo.v_renoworkshop_model
    where cislo_subjektu in (${Prisma.join(id)})
  `;
}

/** Kontaktní osoba z pohledu `v_renoworkshop_kontakty`. */
export type KontaktZHeliosu = {
  cislo_subjektu: number;
  jmeno: string | null;
  prijmeni: string | null;
  ulice_domu: string | null;
  misto_domu: string | null;
  psc_domu: string | null;
  e_mail: string | null;
  telefon_mobil: string | null;
};

/** Všechny kontaktní osoby. */
export async function nactiKontakty(): Promise<KontaktZHeliosu[]> {
  return prisma.$queryRaw<KontaktZHeliosu[]>`
    select * from dbo.v_renoworkshop_kontakty
  `;
}

/** Jen vyjmenované kontaktní osoby - doplnění nových po vozidlech. */
export async function nactiKontaktyPodleId(
  id: number[],
): Promise<KontaktZHeliosu[]> {
  if (id.length === 0) return [];
  return prisma.$queryRaw<KontaktZHeliosu[]>`
    select * from dbo.v_renoworkshop_kontakty
    where cislo_subjektu in (${Prisma.join(id)})
  `;
}
