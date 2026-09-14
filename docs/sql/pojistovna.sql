-- Pojišťovna u zakázky
--
-- Spusť CELÝ tenhle soubor v databázi RenoWorkshop na RENDCAPPu.
-- Jde pustit opakovaně - co už existuje, přeskočí.
--
-- Přidá zakázkám pojistovna_id: cislo_subjektu organizace z pojistovna1
-- na hlavičce zakázky. Název pojišťovny se dohledá v helios_organizace.
-- Naplní synchronizace sama - rozdělané zakázky do pěti minut, ukončené
-- v noci (nebo hned přes `npm run historie`).
--
-- Podmínka: oba zakázkové pohledy vracejí hlv.pojistovna1.
--
-- Pořadí: tenhle skript DŘÍV, než se nasadí nová verze služby.

USE RenoWorkshop;
GO

IF COL_LENGTH('dbo.helios_zakazky', 'pojistovna_id') IS NULL
    ALTER TABLE [dbo].[helios_zakazky] ADD [pojistovna_id] INT;
GO
