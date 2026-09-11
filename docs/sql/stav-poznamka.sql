-- Poznámka u dílenského stavu
--
-- Spusť CELÝ tenhle soubor v databázi RenoWorkshop na RENDCAPPu.
-- Jde pustit opakovaně.
--
-- Přidá k záznamu v historii stavů nepovinnou poznámku: kde vůz stojí,
-- na kterém zvedáku je, na co se čeká. "Připraveno, stání 4" je jiná
-- informace než holé "Připraveno".

USE RenoWorkshop;
GO

IF COL_LENGTH('dbo.dilenske_zaznamy', 'poznamka') IS NULL
    ALTER TABLE [dbo].[dilenske_zaznamy] ADD [poznamka] NVARCHAR(500);
GO
