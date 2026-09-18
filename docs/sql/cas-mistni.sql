-- Oprava časů zapsaných v UTC na místní čas
--
-- Spusť v databázi RenoWorkshop na RENDCAPPu, JEN JEDNOU, a to AŽ PO
-- nasazení verze služby s domain/cas.ts (jinak nové záznamy přibudou dál
-- posunuté).
--
-- Co se stalo: časy našich záznamů (poznámky, stavy, fotky, příjem)
-- zapisovala Prisma v UTC, zatímco data z Heliosu jsou v místním čase.
-- Poznámka napsaná v 10:05 se uložila jako 08:05 a v aplikaci svítila
-- o dvě hodiny dřív (v zimě o hodinu).
--
-- Skript posune zpětně jen řádky starší než @doKdy - tedy ty, které
-- zapsala stará verze služby. AT TIME ZONE si poradí s letním i zimním
-- časem, takže se nic nepřepočítá napevno o dvě hodiny.
--
-- !!! NEPOUŠTĚJ DVAKRÁT - podruhé by se časy posunuly znovu.

USE RenoWorkshop;
GO

-- Čas nasazení nové verze služby. Uprav podle skutečnosti; řádky zapsané
-- po něm už mají místní čas a nesmí se posunout.
DECLARE @doKdy DATETIME2 = '2026-09-18T12:00:00';

-- Kontrola PŘED opravou: kolik řádků se posune a jak to zatím vypadá.
SELECT 'poznamky' AS tabulka, COUNT(*) AS radku, MIN(vytvoreno_at) AS nejstarsi,
       MAX(vytvoreno_at) AS nejnovejsi
FROM dbo.poznamky WHERE vytvoreno_at < @doKdy
UNION ALL SELECT 'dilenske_zaznamy', COUNT(*), MIN(zadano_at), MAX(zadano_at)
FROM dbo.dilenske_zaznamy WHERE zadano_at < @doKdy
UNION ALL SELECT 'fotky', COUNT(*), MIN(nahrano_at), MAX(nahrano_at)
FROM dbo.fotky WHERE nahrano_at < @doKdy;
GO

BEGIN TRANSACTION;

DECLARE @doKdy DATETIME2 = '2026-09-18T12:00:00';

-- Poznámky
UPDATE dbo.poznamky
SET vytvoreno_at = CAST(vytvoreno_at AT TIME ZONE 'UTC'
                        AT TIME ZONE 'Central European Standard Time' AS DATETIME2)
WHERE vytvoreno_at < @doKdy;

-- Dílenské stavy
UPDATE dbo.dilenske_zaznamy
SET zadano_at = CAST(zadano_at AT TIME ZONE 'UTC'
                     AT TIME ZONE 'Central European Standard Time' AS DATETIME2)
WHERE zadano_at < @doKdy;

-- Předmět opravy
UPDATE dbo.dilenske_udaje
SET upraveno_at = CAST(upraveno_at AT TIME ZONE 'UTC'
                       AT TIME ZONE 'Central European Standard Time' AS DATETIME2)
WHERE upraveno_at < @doKdy;

-- Fotodokumentace (názvy souborů ve Foto-doc měly místní čas už dřív,
-- tímhle se s nimi záznamy srovnají)
UPDATE dbo.fotky
SET nahrano_at = CAST(nahrano_at AT TIME ZONE 'UTC'
                      AT TIME ZONE 'Central European Standard Time' AS DATETIME2)
WHERE nahrano_at < @doKdy;

-- Příjem vozidla
UPDATE dbo.prijmy
SET zahajeno_at = CAST(zahajeno_at AT TIME ZONE 'UTC'
                       AT TIME ZONE 'Central European Standard Time' AS DATETIME2),
    dokonceno_at = CASE
        WHEN dokonceno_at IS NULL THEN NULL
        ELSE CAST(dokonceno_at AT TIME ZONE 'UTC'
                  AT TIME ZONE 'Central European Standard Time' AS DATETIME2)
    END
WHERE zahajeno_at < @doKdy;

UPDATE dbo.prijem_polozky
SET zmeneno_at = CAST(zmeneno_at AT TIME ZONE 'UTC'
                      AT TIME ZONE 'Central European Standard Time' AS DATETIME2)
WHERE zmeneno_at < @doKdy;

-- Průběh synchronizací (jen pro přehled v /health a v logu)
UPDATE dbo.synchronizace
SET zacatek_at = CAST(zacatek_at AT TIME ZONE 'UTC'
                      AT TIME ZONE 'Central European Standard Time' AS DATETIME2),
    konec_at = CASE
        WHEN konec_at IS NULL THEN NULL
        ELSE CAST(konec_at AT TIME ZONE 'UTC'
                  AT TIME ZONE 'Central European Standard Time' AS DATETIME2)
    END
WHERE zacatek_at < @doKdy;

-- Kdy zakázku naposledy potvrdila synchronizace; přepíše se sama při
-- příštím běhu, opravuje se jen kvůli přehledu.
UPDATE dbo.helios_zakazky
SET videno_at = CAST(videno_at AT TIME ZONE 'UTC'
                     AT TIME ZONE 'Central European Standard Time' AS DATETIME2),
    uzavrena_at = CASE
        WHEN uzavrena_at IS NULL THEN NULL
        ELSE CAST(uzavrena_at AT TIME ZONE 'UTC'
                  AT TIME ZONE 'Central European Standard Time' AS DATETIME2)
    END
WHERE videno_at < @doKdy;

-- Zkontroluj výsledek (časy musí sedět s tím, kdy lidé opravdu psali),
-- a teprve potom potvrď:
--   COMMIT TRANSACTION;
-- Když něco nesedí:
--   ROLLBACK TRANSACTION;

SELECT TOP 20 cislo_zakazky, autor, vytvoreno_at
FROM dbo.poznamky
ORDER BY vytvoreno_at DESC;
GO

-- log_pristupu se neopravuje - ten má místní čas od začátku (výchozí
-- hodnota SYSDATETIME() v databázi).
