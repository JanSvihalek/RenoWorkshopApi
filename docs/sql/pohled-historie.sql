-- Pohled na ukončené zakázky (historie)
--
-- Spusť CELÝ tenhle soubor v databázi RenoWorkshop na RENDCAPPu.
-- Jde pustit opakovaně - pohled se pokaždé založí znovu.
--
-- Stejné sloupce jako v_renoworkshop_zakazky, jen jiný filtr: stav
-- 3 Ukončeno a 50 Dokončeno. Čte ho noční běh a ruční `npm run historie`,
-- ne pětiminutová synchronizace - ukončených zakázek je kolem 70 000.
--
-- Když se změní sloupce v zakázkovém pohledu, musí se změnit i tady.
-- Synchronizace oba čte do stejné tabulky.
--
-- Samo o sobě nic nepřenese: pohled je jen okno do Heliosu.

USE RenoWorkshop;
GO

if object_id('dbo.v_renoworkshop_zakazky_historie') is not null
    drop view dbo.v_renoworkshop_zakazky_historie;
GO

create view dbo.v_renoworkshop_zakazky_historie as
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
       AND hlv.stav_real IN (3, 50);
GO

-- Kontrola: kolik ukončených zakázek pohled vrací (čekáme kolem 70 000).
-- SELECT COUNT(*) FROM dbo.v_renoworkshop_zakazky_historie;
