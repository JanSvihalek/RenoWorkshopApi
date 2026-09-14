-- Pořadače zakázek
--
-- Spusť CELÝ tenhle soubor v databázi RenoWorkshop na RENDCAPPu.
-- Jde pustit opakovaně - co už existuje, přeskočí; názvy, které jsi
-- mezitím upravil, nepřepíše.
--
-- 1. K zakázkám přidá cislo_poradace (plní synchronizace).
-- 2. Založí převodní tabulku poradace s krátkými názvy pro aplikaci.
--    Plné názvy z Heliosu („SeZ 2 zpracování zakázky BMW BSL") by se do
--    filtru nevešly. Uprav si je, jak se jim na dílně říká:
--
--      UPDATE dbo.poradace SET nazev = N'BMW Brno' WHERE cislo_poradace = 10026;
--
--    Změna se v aplikaci projeví hned, bez nasazování.
--
-- Podmínka: oba zakázkové pohledy vracejí hlv.cislo_poradace.
-- Pořadí: tenhle skript DŘÍV, než se nasadí nová verze služby.

USE RenoWorkshop;
GO

IF COL_LENGTH('dbo.helios_zakazky', 'cislo_poradace') IS NULL
    ALTER TABLE [dbo].[helios_zakazky] ADD [cislo_poradace] INT;
GO

IF OBJECT_ID('dbo.poradace') IS NULL
CREATE TABLE [dbo].[poradace] (
    [cislo_poradace] INT           NOT NULL,
    [nazev]          NVARCHAR(100) NOT NULL,
    CONSTRAINT [poradace_pkey] PRIMARY KEY CLUSTERED ([cislo_poradace])
);
GO

-- Pořadače, které pouští pohled zakázek (stav k 14. 9. 2026). 16878
-- „BMW PBU_" schválně chybí - aplikace ho ignoruje. Existující řádky se
-- nepřepisují - ruční úpravy názvů zůstanou.
INSERT INTO dbo.poradace (cislo_poradace, nazev)
SELECT v.cislo, v.nazev
FROM (VALUES
    (10026, N'BMW BSL'),
    (16015, N'BMW CLI'),
    (16879, N'BMW CSK'),
    (17350, N'BMW PBU'),
    (16017, N'BMW PKC'),
    (16877, N'MOT BSL'),
    (17362, N'MOT CSK')
) AS v (cislo, nazev)
WHERE NOT EXISTS (SELECT 1 FROM dbo.poradace p WHERE p.cislo_poradace = v.cislo);
GO
