-- Stručný popis závady
--
-- Spusť CELÝ tenhle soubor v databázi RenoWorkshop na RENDCAPPu.
-- Jde pustit opakovaně - co už existuje, přeskočí.
--
-- Přidá závadám nazev_subjektu: stručný popis, který aplikace ukazuje
-- tučně nad poznámkou. Naplní synchronizace - u rozdělaných zakázek do
-- pěti minut, u ostatních v noci (nebo hned přes `npm run zavady`).
--
-- Podmínka: pohled v_renoworkshop_zavady vrací nazev_subjektu:
--
--   SELECT cislo_subjektu, reference_subjektu, nazev_subjektu, poznamka, zakazka
--   FROM   RAS_HEN.RNC_ostra.lcs.ino_srvszak_zavady
--
-- Pořadí: tenhle skript DŘÍV, než se nasadí nová verze služby.

USE RenoWorkshop;
GO

IF COL_LENGTH('dbo.helios_zavady', 'nazev_subjektu') IS NULL
    ALTER TABLE [dbo].[helios_zavady] ADD [nazev_subjektu] NVARCHAR(255);
GO
