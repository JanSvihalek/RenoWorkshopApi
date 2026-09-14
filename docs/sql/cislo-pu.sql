-- Číslo pojistné události u zakázky
--
-- Spusť CELÝ tenhle soubor v databázi RenoWorkshop na RENDCAPPu.
-- Jde pustit opakovaně - co už existuje, přeskočí.
--
-- Přidá zakázkám cislo_pu: uživatelsky definovaný atribut ino_cpu
-- z uda_ino_srvszak_hlavicka. Naplní synchronizace sama - rozdělané zakázky
-- do pěti minut, ukončené v noci (nebo hned přes `npm run historie`).
--
-- Podmínka: oba zakázkové pohledy mají join na UDA a vracejí
-- uda.ino_cpu AS cislo_pojistne_udalosti (docs/sql/pohled-zakazky-jen-rozdelane.sql,
-- docs/sql/pohled-historie.sql).
--
-- Pořadí: tenhle skript DŘÍV, než se nasadí nová verze služby.

USE RenoWorkshop;
GO

IF COL_LENGTH('dbo.helios_zakazky', 'cislo_pu') IS NULL
    ALTER TABLE [dbo].[helios_zakazky] ADD [cislo_pu] NVARCHAR(100);
GO
