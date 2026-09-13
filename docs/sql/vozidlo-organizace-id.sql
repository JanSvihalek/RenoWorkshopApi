-- Odkaz zakázky na vozidlo a organizaci
--
-- Spusť CELÝ tenhle soubor v databázi RenoWorkshop na RENDCAPPu.
-- Jde pustit opakovaně - co už existuje, přeskočí.
--
-- Přidá zakázce dva sloupce s `cislo_subjektu` vozidla a organizace
-- z Heliosu. Naplní je až nejbližší synchronizace, sama od sebe.
--
-- Bez cizích klíčů schválně: zakázka na vozidlo, které se ještě
-- nedotáhlo, nesmí shodit celou synchronizaci.
--
-- Podmínka: pohled v_renoworkshop_zakazky musí vracet sloupce
-- vozidlo_id a organizace_id (viz src/helios/dotazy.sql).

USE RenoWorkshop;
GO

IF COL_LENGTH('dbo.helios_zakazky', 'vozidlo_id') IS NULL
    ALTER TABLE [dbo].[helios_zakazky] ADD [vozidlo_id] INT;
GO

IF COL_LENGTH('dbo.helios_zakazky', 'organizace_id') IS NULL
    ALTER TABLE [dbo].[helios_zakazky] ADD [organizace_id] INT;
GO

-- Historie vozu: všechny zakázky jednoho vozidla, od nejnovější.
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'helios_zakazky_vozidlo_id_datum_prijeti_idx'
                 AND object_id = OBJECT_ID('dbo.helios_zakazky'))
    CREATE INDEX [helios_zakazky_vozidlo_id_datum_prijeti_idx]
        ON [dbo].[helios_zakazky] ([vozidlo_id], [datum_prijeti]);
GO
