-- Zakázkový pohled jen na rozdělané zakázky
--
-- Spusť AŽ PO naplnění historie (docs/sql/pohled-historie.sql
-- a `npm run historie`). Dřív to nic nerozbije, jen by ukončené zakázky
-- chyběly o to déle.
--
-- Mění jedinou podmínku: `stav_real <> 10` na `NOT IN (3, 10)`.
-- Pětiminutová synchronizace pak nečte desítky tisíc ukončených zakázek,
-- které si stejně zahazovala - nově je tahá noční historie.
--
-- 50 Dokončeno zůstává mezi rozdělanými: pro dílnu to neznamená, že je
-- zakázka kompletně hotová.
--
-- ALTER VIEW, ne drop + create: pohled se vymění za běhu a synchronizace
-- mezitím nenarazí na chybějící objekt.
--
-- Vychází z textu pohledu na serveru ze 14. 9. 2026. Pokud jsi pohled od
-- té doby měnil, nepřepisuj ho tímhle souborem - změň v něm ručně jen
-- řádek s WHERE.

USE RenoWorkshop;
GO

ALTER VIEW dbo.v_renoworkshop_zakazky AS
SELECT hlv.reference_subjektu AS c_zakazky,
       hlv.vin1               AS vin,
       hlv.spz,
       znm.nazev_dlouhy       AS model,
       org.nazev_subjektu     AS organizace,
       hlv.vozidlo            AS vozidlo_id,
       hlv.organizace         AS organizace_id,
       sub.reference_subjektu AS utvar,
       sub.nazev_subjektu     AS utvar_nazev,
       hlv.datum_prijeti,
       hlv.datum_zprovozneni  AS predpoklad_datum_dokonceni,
       hlv.stav_real,
       val.display_value      AS stav_HeN,
       CASE WHEN rada.reference_subjektu LIKE '8%'
            THEN LTRIM(RTRIM(rada.reference_subjektu))
       END                    AS zakazka_rada,
       tech.reference_subjektu AS zodpovida_kod,
       tech.nazev_subjektu     AS zodpovida
FROM   RAS_HEN.RNC_ostra.lcs.ino_srvszak_hlavicka AS hlv
       LEFT OUTER JOIN RAS_HEN.RNC_ostra.lcs.organizace AS org
            ON hlv.organizace = org.cislo_subjektu
       LEFT OUTER JOIN RAS_HEN.RNC_ostra.lcs.subjekty AS sub
            ON hlv.zpracovatel = sub.cislo_subjektu
       LEFT OUTER JOIN RAS_HEN.RNC_ostra.lcs.attribute_valuation_entry AS val
            ON hlv.stav_real = val.db_value_int
           AND val.cislo_subjektu = 64208
       LEFT OUTER JOIN RAS_HEN.RNC_ostra.lcs.ino_vozidlo AS voz
            ON hlv.vozidlo = voz.cislo_subjektu
       LEFT OUTER JOIN RAS_HEN.RNC_ostra.lcs.ino_znackamodel AS znm
            ON voz.znackamodel = znm.cislo_subjektu
       LEFT OUTER JOIN RAS_HEN.RNC_ostra.lcs.ino_srvszak_zakazka AS rada
            ON hlv.zakazka_hlavni = rada.cislo_subjektu
       LEFT OUTER JOIN RAS_HEN.RNC_ostra.lcs.subjekty AS tech
            ON hlv.zodpovida = tech.cislo_subjektu
WHERE  hlv.cislo_poradace IN (10026, 16015, 16879, 17350, 16017, 16877, 17362)
       AND hlv.stav_real NOT IN (3, 10);
GO

-- Kontrola: čekáme řádově tisíce řádků, ne desítky tisíc, a vyplněnou
-- zodpovědnou osobu.
-- SELECT COUNT(*) FROM dbo.v_renoworkshop_zakazky;
-- SELECT TOP 5 c_zakazky, vozidlo_id, zodpovida FROM dbo.v_renoworkshop_zakazky;
