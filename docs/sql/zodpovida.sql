-- Zodpovědná osoba u zakázky
--
-- Spusť CELÝ tenhle soubor v databázi RenoWorkshop na RENDCAPPu.
-- Jde pustit opakovaně - co už existuje, přeskočí.
--
-- Přidá zakázce dva sloupce: kód a jméno toho, kdo za ni v Heliosu
-- zodpovídá. Naplní je až nejbližší synchronizace, sama od sebe.
--
-- Podmínka: pohled v_renoworkshop_zakazky musí vracet sloupce
-- zodpovida_kod a zodpovida.

USE RenoWorkshop;
GO

IF COL_LENGTH('dbo.helios_zakazky', 'zodpovida_kod') IS NULL
    ALTER TABLE [dbo].[helios_zakazky] ADD [zodpovida_kod] NVARCHAR(50);
GO

IF COL_LENGTH('dbo.helios_zakazky', 'zodpovida') IS NULL
    ALTER TABLE [dbo].[helios_zakazky] ADD [zodpovida] NVARCHAR(200);
GO
