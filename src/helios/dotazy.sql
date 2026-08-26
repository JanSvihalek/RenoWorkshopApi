-- Pohledy nad Heliosem, ze kterých čte synchronizace.
--
-- Zdroj pravdy pro běh jsou pohledy založené na SQL Serveru; tenhle soubor
-- je jejich verzovaná kopie. Když se pohled změní, přepiš i tenhle soubor,
-- ať je v historii vidět proč.
--
-- Pozor: SQL Server RENOCARu je starší než 2016 SP1, takže
-- `create or alter view` neprojde. Proto drop + create.
-- Zakládat v normálním query okně, ne v grafickém návrháři (neumí CTE).

if object_id('dbo.v_renoworkshop_zakazky') is not null
    drop view dbo.v_renoworkshop_zakazky;
go

create view dbo.v_renoworkshop_zakazky as
SELECT hlv.reference_subjektu AS c_zakazky,
       hlv.vin1               AS vin,
       hlv.spz,
       znm.nazev_dlouhy       AS model,
       org.nazev_subjektu     AS organizace,
       sub.reference_subjektu AS utvar,
       sub.nazev_subjektu     AS utvar_nazev,
       hlv.datum_prijeti,
       hlv.datum_zprovozneni  AS predpoklad_datum_dokonceni,
       hlv.stav_real,
       val.display_value      AS stav_HeN
FROM   lcs.ino_srvszak_hlavicka AS hlv
       LEFT OUTER JOIN lcs.organizace AS org
            ON hlv.organizace = org.cislo_subjektu
       LEFT OUTER JOIN lcs.subjekty AS sub
            ON hlv.zpracovatel = sub.cislo_subjektu
       -- Podmínka na číselník patří do ON, ne do WHERE. Ve WHERE by
       -- z tohohle levého joinu udělala vnitřní a zakázka s neznámým
       -- stavem by z výsledku zmizela.
       LEFT OUTER JOIN lcs.attribute_valuation_entry AS val
            ON hlv.stav_real = val.db_value_int
           AND val.cislo_subjektu = 64208
       LEFT OUTER JOIN lcs.ino_vozidlo AS voz
            ON hlv.vozidlo = voz.cislo_subjektu
       LEFT OUTER JOIN lcs.ino_znackamodel AS znm
            ON voz.znackamodel = znm.cislo_subjektu
WHERE  hlv.cislo_poradace IN (10026, 16015, 16879, 17350, 16017, 16877, 17362)
       AND hlv.stav_real <> 10;
go

-- Úkony (závady) samostatně - v hlavním pohledu by násobily zakázky.
if object_id('dbo.v_renoworkshop_ukony') is not null
    drop view dbo.v_renoworkshop_ukony;
go

create view dbo.v_renoworkshop_ukony as
SELECT hlv.reference_subjektu AS c_zakazky,
       zav.cislo_subjektu     AS ukon_id,
       zav.nazev_subjektu     AS ukon
FROM   lcs.ino_srvszak_hlavicka AS hlv
       JOIN lcs.ino_srvszak_zavady AS zav
            ON hlv.cislo_subjektu = zav.zakazka
WHERE  hlv.cislo_poradace IN (10026, 16015, 16879, 17350, 16017, 16877, 17362)
       AND hlv.stav_real <> 10
       AND zav.nazev_subjektu IS NOT NULL;
go

-- ---------------------------------------------------------------------
-- Kdyby byly pohledy přes linkovaný server pomalé
-- ---------------------------------------------------------------------
--
-- Dotaz nahoře používá čtyřdílné názvy. SQL Server se u nich sám rozhoduje,
-- kolik práce pošle na Helios a kolik si udělá sám - a někdy si natáhne celé
-- tabulky k sobě a spojuje je až tady. Na šesti tabulkách to umí být rozdíl
-- mezi vteřinou a minutou.
--
-- OPENQUERY tu volbu bere z ruky: celý dotaz se provede na Heliosu a po síti
-- se vrátí jen výsledek. Nevýhoda je čitelnost - vnitřní dotaz je řetězec,
-- takže se apostrofy musí zdvojovat.
--
-- Postup: nasadit variantu nahoře, změřit
--   set statistics time on; select count(*) from dbo.v_renoworkshop_zakazky;
-- a když to trvá znatelně déle než přímo na Heliosu, přepnout na tuhle.
--
-- if object_id('dbo.v_renoworkshop_zakazky') is not null
--     drop view dbo.v_renoworkshop_zakazky;
-- go
--
-- create view dbo.v_renoworkshop_zakazky as
-- select * from openquery(RAS_HEN, '
--     SELECT hlv.reference_subjektu AS c_zakazky,
--            hlv.vin1               AS vin,
--            hlv.spz,
--            znm.nazev_dlouhy       AS model,
--            org.nazev_subjektu     AS organizace,
--            sub.reference_subjektu AS utvar,
--            sub.nazev_subjektu     AS utvar_nazev,
--            hlv.datum_prijeti,
--            hlv.datum_zprovozneni  AS predpoklad_datum_dokonceni,
--            hlv.stav_real,
--            val.display_value      AS stav_HeN
--     FROM   RNC_ostra.lcs.ino_srvszak_hlavicka AS hlv
--            LEFT OUTER JOIN RNC_ostra.lcs.organizace AS org
--                 ON hlv.organizace = org.cislo_subjektu
--            LEFT OUTER JOIN RNC_ostra.lcs.subjekty AS sub
--                 ON hlv.zpracovatel = sub.cislo_subjektu
--            LEFT OUTER JOIN RNC_ostra.lcs.attribute_valuation_entry AS val
--                 ON hlv.stav_real = val.db_value_int
--                AND val.cislo_subjektu = 64208
--            LEFT OUTER JOIN RNC_ostra.lcs.ino_vozidlo AS voz
--                 ON hlv.vozidlo = voz.cislo_subjektu
--            LEFT OUTER JOIN RNC_ostra.lcs.ino_znackamodel AS znm
--                 ON voz.znackamodel = znm.cislo_subjektu
--     WHERE  hlv.cislo_poradace IN (10026, 16015, 16879, 17350, 16017, 16877, 17362)
--            AND hlv.stav_real <> 10
-- ');
-- go
