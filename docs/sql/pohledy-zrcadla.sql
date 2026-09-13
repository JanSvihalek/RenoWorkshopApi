-- Čtyři pohledy pro vyhledávání podle SPZ
--
-- Spusť CELÝ tenhle soubor v databázi RenoWorkshop na RENDCAPPu.
-- Jde pustit opakovaně - pohledy se pokaždé založí znovu.
--
-- Zakládá jen NOVÉ pohledy. Zakázkového v_renoworkshop_zakazky se
-- nedotýká schválně: ten na serveru obsahuje úpravy, které v repozitáři
-- nejsou (zodpovědná osoba), a drop + create by o ně přišel.
--
-- Pohledy musí zůstat prosté. Synchronizace se na nové záznamy doptává
-- dotazem `where cislo_subjektu in (...)` a spoléhá, že se podmínka
-- propíše až na Helios. S `openquery`, `distinct` nebo agregací by to
-- přestalo platit a místo dvou řádků by se přetáhla celá tabulka.
--
-- Samo o sobě to nic nepřenese: pohled je jen okno do Heliosu. Data se
-- do našich tabulek dostanou až synchronizací.

USE RenoWorkshop;
GO

if object_id('dbo.v_renoworkshop_vozidlo') is not null
    drop view dbo.v_renoworkshop_vozidlo;
GO

create view dbo.v_renoworkshop_vozidlo as
SELECT cislo_subjektu, reference_subjektu, nazev_subjektu, spz,
       vyr_cislo_karoserie, znackamodel, majitel, kontaktni_osoba,
       stav_tachometru, prodej_datum
FROM   RAS_HEN.RNC_ostra.lcs.ino_vozidlo;
GO

if object_id('dbo.v_renoworkshop_organizace') is not null
    drop view dbo.v_renoworkshop_organizace;
GO

create view dbo.v_renoworkshop_organizace as
SELECT cislo_subjektu, reference_subjektu, nazev_subjektu, ico, dic, ulice,
       misto, psc, telefon, e_mail, cislo_co, cislo_cp, ulice_ds
FROM   RAS_HEN.RNC_ostra.lcs.organizace;
GO

if object_id('dbo.v_renoworkshop_model') is not null
    drop view dbo.v_renoworkshop_model;
GO

create view dbo.v_renoworkshop_model as
SELECT cislo_subjektu, reference_subjektu, nazev_subjektu, serie,
       nazev_dlouhy, palivo, motor
FROM   RAS_HEN.RNC_ostra.lcs.ino_znackamodel;
GO

if object_id('dbo.v_renoworkshop_kontakty') is not null
    drop view dbo.v_renoworkshop_kontakty;
GO

create view dbo.v_renoworkshop_kontakty as
SELECT cislo_subjektu, jmeno, prijmeni, ulice_domu, misto_domu, psc_domu,
       e_mail, telefon_mobil
FROM   RAS_HEN.RNC_ostra.lcs.kontaktni_osoby;
GO
