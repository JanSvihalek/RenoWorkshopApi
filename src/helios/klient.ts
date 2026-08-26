import sql from 'mssql';

import { config } from '../config.js';

/**
 * Připojení k SQL Serveru, který má linkovaný server na Helios.
 *
 * **Jen pro čtení.** Účet má mít práva pouze SELECT nad pohledy
 * `v_renoworkshop_*`; do Heliosu se nikdy nezapisuje.
 */
let pool: sql.ConnectionPool | null = null;

export async function heliosPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;

  pool = await new sql.ConnectionPool({
    server: config.HELIOS_SERVER,
    database: config.HELIOS_DATABASE,
    user: config.HELIOS_USER,
    password: config.HELIOS_PASSWORD,
    options: {
      trustServerCertificate: config.heliosTrustCert,
      encrypt: true,
    },
    pool: { max: 4, min: 0, idleTimeoutMillis: 30_000 },
    // Dotaz přes linkovaný server je pomalejší než místní; když ale běží
    // přes minutu, něco je špatně a nemá smysl na to čekat.
    requestTimeout: 60_000,
  }).connect();

  return pool;
}

export async function zavriHelios(): Promise<void> {
  await pool?.close();
  pool = null;
}

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
};

export type UkonZHeliosu = {
  c_zakazky: string;
  ukon_id: number;
  ukon: string;
};

export async function nactiZakazky(): Promise<ZakazkaZHeliosu[]> {
  const spojeni = await heliosPool();
  const vysledek = await spojeni
    .request()
    .query<ZakazkaZHeliosu>('select * from dbo.v_renoworkshop_zakazky');
  return vysledek.recordset;
}

export async function nactiUkony(): Promise<UkonZHeliosu[]> {
  const spojeni = await heliosPool();
  const vysledek = await spojeni
    .request()
    .query<UkonZHeliosu>('select * from dbo.v_renoworkshop_ukony');
  return vysledek.recordset;
}
