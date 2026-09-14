-- Závady z Heliosu
--
-- Spusť CELÝ tenhle soubor v databázi RenoWorkshop na RENDCAPPu.
-- Jde pustit opakovaně - co už existuje, přeskočí.
--
-- 1. K zakázkám přidá zakazka_id: cislo_subjektu hlavičky zakázky
--    v Heliosu. Přes něj se napojují závady - číslo zakázky na to nestačí,
--    v Heliosu se výjimečně opakuje.
-- 2. Založí zrcadlo závad helios_zavady.
--
-- Naplní je synchronizace sama: závady rozdělaných zakázek do pěti minut,
-- ostatní v noci (nebo hned přes `npm run zavady`).
--
-- Podmínky na straně pohledů:
--   * v_renoworkshop_zakazky i v_renoworkshop_zakazky_historie vracejí
--     hlv.cislo_subjektu (jako cislo_subjektu nebo zakazka_id - služba
--     přijme obojí),
--   * existuje pohled v_renoworkshop_zavady.
--
-- Pořadí: tenhle skript DŘÍV, než se nasadí nová verze služby.

USE RenoWorkshop;
GO

IF COL_LENGTH('dbo.helios_zakazky', 'zakazka_id') IS NULL
    ALTER TABLE [dbo].[helios_zakazky] ADD [zakazka_id] INT;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'helios_zakazky_zakazka_id_idx'
                 AND object_id = OBJECT_ID('dbo.helios_zakazky'))
    CREATE INDEX [helios_zakazky_zakazka_id_idx]
        ON [dbo].[helios_zakazky] ([zakazka_id]);
GO

IF OBJECT_ID('dbo.helios_zavady') IS NULL
CREATE TABLE [dbo].[helios_zavady] (
    [cislo_subjektu]     INT            NOT NULL,
    [zakazka]            INT            NULL,
    [reference_subjektu] NVARCHAR(50)   NULL,
    [poznamka]           NVARCHAR(MAX)  NULL,
    [videno_at]          DATETIME2      NOT NULL,
    CONSTRAINT [helios_zavady_pkey] PRIMARY KEY CLUSTERED ([cislo_subjektu])
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'helios_zavady_zakazka_idx'
                 AND object_id = OBJECT_ID('dbo.helios_zavady'))
    CREATE INDEX [helios_zavady_zakazka_idx]
        ON [dbo].[helios_zavady] ([zakazka]);
GO
