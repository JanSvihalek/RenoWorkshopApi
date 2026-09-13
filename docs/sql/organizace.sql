-- Zrcadlo zákazníků z Heliosu
--
-- Spusť CELÝ tenhle soubor v databázi RenoWorkshop na RENDCAPPu.
-- Jde pustit opakovaně - co už existuje, přeskočí.
--
-- Založí tabulku helios_organizace. Naplní ji synchronizace, sama od sebe.
--
-- Podmínka: pohled dbo.v_renoworkshop_organizace musí existovat.
--
-- Šířky jsou velkorysejší než v Heliosu schválně. Užší sloupec by při
-- nečekaně dlouhé hodnotě shodil celou synchronizaci (P2000), širší
-- nestojí nic - NVARCHAR je proměnné délky.

USE RenoWorkshop;
GO

IF OBJECT_ID('dbo.helios_organizace') IS NULL
CREATE TABLE [dbo].[helios_organizace] (
    [cislo_subjektu]     INT            NOT NULL,
    [reference_subjektu] NVARCHAR(50)   NULL,
    [nazev_subjektu]     NVARCHAR(255)  NULL,
    [ico]                NVARCHAR(20)   NULL,
    [dic]                NVARCHAR(30)   NULL,
    [ulice]              NVARCHAR(255)  NULL,
    [cislo_cp]           NVARCHAR(20)   NULL,
    [cislo_co]           NVARCHAR(20)   NULL,
    [misto]              NVARCHAR(255)  NULL,
    [psc]                NVARCHAR(20)   NULL,
    [ulice_ds]           NVARCHAR(255)  NULL,
    [telefon]            NVARCHAR(60)   NULL,
    [email]              NVARCHAR(255)  NULL,
    [videno_at]          DATETIME2      NOT NULL,
    CONSTRAINT [helios_organizace_pkey] PRIMARY KEY CLUSTERED ([cislo_subjektu])
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'helios_organizace_nazev_subjektu_idx'
                 AND object_id = OBJECT_ID('dbo.helios_organizace'))
    CREATE INDEX [helios_organizace_nazev_subjektu_idx]
        ON [dbo].[helios_organizace] ([nazev_subjektu]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'helios_organizace_ico_idx'
                 AND object_id = OBJECT_ID('dbo.helios_organizace'))
    CREATE INDEX [helios_organizace_ico_idx]
        ON [dbo].[helios_organizace] ([ico]);
GO
