-- Pohled nad Heliosem, ze kterého čte synchronizace.
--
-- Zdroj pravdy pro běh je pohled založený na SQL Serveru; tenhle soubor
-- je jeho verzovaná kopie. Když se pohled změní, přepiš i tenhle soubor,
-- ať je v historii vidět proč.
--
-- Zakázky a k nim čtyři zrcadla: vozidla, zákazníci, číselník značek
-- a modelů a kontaktní osoby. Úkony (závady) se do appky netahají.
--
-- Pozor na čtyřdílné názvy `RAS_HEN.RNC_ostra.lcs.*`: pohled vzniká
-- v databázi RenoWorkshop na RENDCAPPu, kde schéma `lcs` neexistuje.
-- Ve variantě přes OPENQUERY na konci souboru se prefix `RAS_HEN`
-- naopak neuvádí - tam už dotaz běží přímo na Heliosu.
--
-- Pozor: SQL Server RENOCARu je starší než 2016 SP1, takže
-- `create or alter view` neprojde. Proto drop + create.
-- Zakládat v normálním query okně, ne v grafickém návrháři (neumí CTE).

if object_id('dbo.v_renoworkshop_zakazky') is not null
    drop view dbo.v_renoworkshop_zakazky;
go

-- Srovnáno podle serveru 14. 9. 2026 (Script View as z RENDCAPPu),
-- s filtrem jen na rozdělané zakázky z docs/sql/pohled-zakazky-jen-rozdelane.sql.
-- Ukončené tahá zvlášť pohled historie níže.
create view dbo.v_renoworkshop_zakazky as
SELECT hlv.reference_subjektu AS c_zakazky,
       hlv.vin1               AS vin,
       hlv.spz,
       znm.nazev_dlouhy       AS model,
       org.nazev_subjektu     AS organizace,
       -- Vozidlo a organizace jako klíče, ne jen jako text. Slouží k poskládání
       -- historie vozu: naskenuje se SPZ, najde vozidlo a k němu všechny jeho
       -- zakázky napříč lety. Viz zrcadla níže.
       hlv.vozidlo            AS vozidlo_id,
       hlv.organizace         AS organizace_id,
       hlv.cislo_subjektu,
       hlv.pojistovna1,
       hlv.cislo_poradace,
       uda.ino_cpu            AS cislo_pojistne_udalosti,
       sub.reference_subjektu AS utvar,
       sub.nazev_subjektu     AS utvar_nazev,
       hlv.datum_prijeti,
       hlv.datum_zprovozneni  AS predpoklad_datum_dokonceni,
       hlv.stav_real,
       val.display_value      AS stav_HeN,
       -- Číslo řady zakázky (801 běžná, 802 interní, 803 PDI...).
       -- Schválně číslo, ne název: název se dá v Heliosu přepsat a filtr
       -- zapnutý v telefonu by pak přestal sedět. Názvy k číslům drží
       -- tabulka dbo.typy_zakazek v databázi RenoWorkshop.
       --
       -- Číselník obsahuje i řady, které se servisu netýkají, a některé
       -- mají dlouhou referenci - na těch první synchronizace spadla.
       -- Zajímají nás jen řady 8xx; ostatní zakázky se **nezahazují**,
       -- jen zůstanou bez typu.
       CASE WHEN rada.reference_subjektu LIKE '8%'
            THEN LTRIM(RTRIM(rada.reference_subjektu))
       END                    AS zakazka_rada,
       -- Kdo za zakázku zodpovídá. Stejná tabulka subjekty jako útvar,
       -- proto druhý alias: kód je stabilní klíč, jméno se zobrazuje.
       tech.reference_subjektu AS zodpovida_kod,
       tech.nazev_subjektu     AS zodpovida
FROM   RAS_HEN.RNC_ostra.lcs.ino_srvszak_hlavicka AS hlv
       LEFT OUTER JOIN RAS_HEN.RNC_ostra.lcs.organizace AS org
            ON hlv.organizace = org.cislo_subjektu
       LEFT OUTER JOIN RAS_HEN.RNC_ostra.lcs.subjekty AS sub
            ON hlv.zpracovatel = sub.cislo_subjektu
       -- Podmínka na číselník patří do ON, ne do WHERE. Ve WHERE by
       -- z tohohle levého joinu udělala vnitřní a zakázka s neznámým
       -- stavem by z výsledku zmizela.
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
       -- Číslo pojistné události je uživatelsky definovaný atribut, ne
       -- sloupec hlavičky. UDA má jeden řádek na hlavičku zakázky.
       LEFT OUTER JOIN RAS_HEN.RNC_ostra.lcs.uda_ino_srvszak_hlavicka AS uda
            ON uda.cislo_subjektu = hlv.cislo_subjektu
WHERE  hlv.cislo_poradace IN (10026, 16015, 16879, 17350, 16017, 16877, 17362)
       AND hlv.stav_real NOT IN (3, 10);
go

-- Historie: tytéž sloupce, jen ukončené zakázky (3 Ukončeno). Desítky tisíc
-- řádků, proto ji čte noční běh, ne pětiminutová synchronizace.
-- 50 Dokončeno patří mezi rozdělané - pro dílnu to není kompletně hotová
-- zakázka.
-- Když se změní sloupce v pohledu nahoře, musí se změnit i tady - oba se
-- zapisují do stejné tabulky helios_zakazky. Plný text je
-- v docs/sql/pohled-historie.sql, liší se jen posledním řádkem WHERE:
--
--   AND hlv.stav_real = 3;

-- =====================================================================
-- Zrcadla: vozidla, zákazníci, modely, kontakty
-- =====================================================================
--
-- Prostý opis tabulek z Heliosu, bez filtru. Slouží vyhledávání: naskenuje
-- se SPZ, najde vozidlo a od něj majitel a všechny jeho zakázky.
--
-- Sloupce jsou vypsané jménem schválně, ne `select *`:
--   * přes linkovaný server jde po síti všechno, co pohled vrátí, a LCS
--     tabulky mají přes sto sloupců,
--   * kopírovat osobní údaje, které aplikace nepoužije, nemá smysl,
--   * pohled založený přes `select *` si seznam sloupců zapamatuje při
--     vzniku a po změně tabulky vrací starou strukturu, dokud na něj
--     někdo nepustí `sp_refreshview`.
--
-- Pohledy musí zůstat **prosté**. Synchronizace se na nové záznamy doptává
-- dotazem `where cislo_subjektu in (...)` a spoléhá, že se podmínka propíše
-- až na Helios. S `openquery`, `distinct` nebo agregací by to přestalo
-- platit a místo dvou řádků by se přetáhla celá tabulka.

if object_id('dbo.v_renoworkshop_vozidlo') is not null
    drop view dbo.v_renoworkshop_vozidlo;
go

create view dbo.v_renoworkshop_vozidlo as
SELECT cislo_subjektu, reference_subjektu, nazev_subjektu, spz,
       vyr_cislo_karoserie, znackamodel, majitel, kontaktni_osoba,
       stav_tachometru, prodej_datum
FROM   RAS_HEN.RNC_ostra.lcs.ino_vozidlo;
go

if object_id('dbo.v_renoworkshop_organizace') is not null
    drop view dbo.v_renoworkshop_organizace;
go

create view dbo.v_renoworkshop_organizace as
SELECT cislo_subjektu, reference_subjektu, nazev_subjektu, ico, dic, ulice,
       misto, psc, telefon, e_mail, cislo_co, cislo_cp, ulice_ds
FROM   RAS_HEN.RNC_ostra.lcs.organizace;
go

if object_id('dbo.v_renoworkshop_model') is not null
    drop view dbo.v_renoworkshop_model;
go

create view dbo.v_renoworkshop_model as
SELECT cislo_subjektu, reference_subjektu, nazev_subjektu, serie,
       nazev_dlouhy, palivo, motor
FROM   RAS_HEN.RNC_ostra.lcs.ino_znackamodel;
go

if object_id('dbo.v_renoworkshop_kontakty') is not null
    drop view dbo.v_renoworkshop_kontakty;
go

create view dbo.v_renoworkshop_kontakty as
SELECT cislo_subjektu, jmeno, prijmeni, ulice_domu, misto_domu, psc_domu,
       e_mail, telefon_mobil
FROM   RAS_HEN.RNC_ostra.lcs.kontaktni_osoby;
go

-- =====================================================================
-- Závady (úkony) na zakázkách
-- =====================================================================
--
-- Prostý opis tabulky. `zakazka` je cislo_subjektu hlavičky zakázky, proto
-- oba zakázkové pohledy nahoře vracejí i hlv.cislo_subjektu (na serveru
-- od 14. 9. 2026 doplněno jako `cislo_subjektu`; služba přijme i alias
-- `zakazka_id`). Do seznamu sloupců obou zakázkových pohledů patří:
--
--   hlv.cislo_subjektu,
--
-- Synchronizace se ptá `where zakazka in (...)` - pohled musí zůstat
-- prostý, ať se podmínka propíše až na Helios.

if object_id('dbo.v_renoworkshop_zavady') is not null
    drop view dbo.v_renoworkshop_zavady;
go

create view dbo.v_renoworkshop_zavady as
SELECT cislo_subjektu, reference_subjektu, nazev_subjektu, poznamka, zakazka
FROM   RAS_HEN.RNC_ostra.lcs.ino_srvszak_zavady;
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
--            hlv.vozidlo            AS vozidlo_id,
--            hlv.organizace         AS organizace_id,
--            hlv.cislo_subjektu,
--            hlv.pojistovna1,
--            hlv.cislo_poradace,
--            uda.ino_cpu            AS cislo_pojistne_udalosti,
--            sub.reference_subjektu AS utvar,
--            sub.nazev_subjektu     AS utvar_nazev,
--            hlv.datum_prijeti,
--            hlv.datum_zprovozneni  AS predpoklad_datum_dokonceni,
--            hlv.stav_real,
--            val.display_value      AS stav_HeN,
--            CASE WHEN rada.reference_subjektu LIKE ''8%''
--                 THEN LTRIM(RTRIM(rada.reference_subjektu))
--            END                    AS zakazka_rada,
--            tech.reference_subjektu AS zodpovida_kod,
--            tech.nazev_subjektu     AS zodpovida
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
--            LEFT OUTER JOIN RNC_ostra.lcs.ino_srvszak_zakazka AS rada
--                 ON hlv.zakazka_hlavni = rada.cislo_subjektu
--            LEFT OUTER JOIN RNC_ostra.lcs.subjekty AS tech
--                 ON hlv.zodpovida = tech.cislo_subjektu
--            LEFT OUTER JOIN RNC_ostra.lcs.uda_ino_srvszak_hlavicka AS uda
--                 ON uda.cislo_subjektu = hlv.cislo_subjektu
--     WHERE  hlv.cislo_poradace IN (10026, 16015, 16879, 17350, 16017, 16877, 17362)
--            AND hlv.stav_real NOT IN (3, 10)
-- ');
-- go
