-- Zrcadla vozidel, zákazníků, modelů a kontaktů
--
-- Spusť CELÝ tenhle soubor v databázi RenoWorkshop na RENDCAPPu.
-- Jde pustit opakovaně - co už existuje, přeskočí.
--
-- Založí čtyři tabulky. Naplní je synchronizace, sama od sebe.
-- Kvůli nim jde po naskenování SPZ ukázat vozidlo, jeho majitele
-- a všechny jeho zakázky napříč lety, aniž by se appka ptala Heliosu.
--
-- Podmínka: musí existovat pohledy v_renoworkshop_vozidlo,
-- v_renoworkshop_organizace, v_renoworkshop_model a v_renoworkshop_kontakty
-- (jejich text je v src/helios/dotazy.sql).
--
-- Bez cizích klíčů mezi tabulkami schválně: vozidlo, jehož majitel se
-- ještě nedotáhl, nesmí shodit celou synchronizaci. Stejný důvod jako
-- u rada_reference.
--
-- Šířky jsou velkorysejší než v Heliosu. Užší sloupec by při nečekaně
-- dlouhé hodnotě shodil synchronizaci (P2000), širší nestojí nic -
-- NVARCHAR je proměnné délky.

USE RenoWorkshop;
GO

-- ---------------------------------------------------------------- vozidla
IF OBJECT_ID('dbo.helios_vozidla') IS NULL
CREATE TABLE [dbo].[helios_vozidla] (
    [cislo_subjektu]     INT            NOT NULL,
    [reference_subjektu] NVARCHAR(50)   NULL,
    [nazev_subjektu]     NVARCHAR(255)  NULL,
    [spz]                NVARCHAR(30)   NULL,
    [vin]                NVARCHAR(50)   NULL,
    [znackamodel]        INT            NULL,
    [majitel]            INT            NULL,
    [kontaktni_osoba]    INT            NULL,
    [stav_tachometru]    INT            NULL,
    [prodej_datum]       DATETIME2      NULL,
    [videno_at]          DATETIME2      NOT NULL,
    CONSTRAINT [helios_vozidla_pkey] PRIMARY KEY CLUSTERED ([cislo_subjektu])
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'helios_vozidla_spz_idx'
                 AND object_id = OBJECT_ID('dbo.helios_vozidla'))
    CREATE INDEX [helios_vozidla_spz_idx] ON [dbo].[helios_vozidla] ([spz]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'helios_vozidla_vin_idx'
                 AND object_id = OBJECT_ID('dbo.helios_vozidla'))
    CREATE INDEX [helios_vozidla_vin_idx] ON [dbo].[helios_vozidla] ([vin]);
GO

-- ------------------------------------------------------------- organizace
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

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'helios_organizace_ico_idx'
                 AND object_id = OBJECT_ID('dbo.helios_organizace'))
    CREATE INDEX [helios_organizace_ico_idx]
        ON [dbo].[helios_organizace] ([ico]);
GO

-- ----------------------------------------------------- značky a modely
IF OBJECT_ID('dbo.helios_modely') IS NULL
CREATE TABLE [dbo].[helios_modely] (
    [cislo_subjektu]     INT            NOT NULL,
    [reference_subjektu] NVARCHAR(50)   NULL,
    [nazev_subjektu]     NVARCHAR(255)  NULL,
    [serie]              NVARCHAR(100)  NULL,
    [nazev_dlouhy]       NVARCHAR(255)  NULL,
    [palivo]             NVARCHAR(100)  NULL,
    [motor]              NVARCHAR(255)  NULL,
    [videno_at]          DATETIME2      NOT NULL,
    CONSTRAINT [helios_modely_pkey] PRIMARY KEY CLUSTERED ([cislo_subjektu])
);
GO

-- --------------------------------------------------------------- kontakty
IF OBJECT_ID('dbo.helios_kontakty') IS NULL
CREATE TABLE [dbo].[helios_kontakty] (
    [cislo_subjektu] INT            NOT NULL,
    [jmeno]          NVARCHAR(255)  NULL,
    [prijmeni]       NVARCHAR(255)  NULL,
    [ulice_domu]     NVARCHAR(255)  NULL,
    [misto_domu]     NVARCHAR(255)  NULL,
    [psc_domu]       NVARCHAR(20)   NULL,
    [email]          NVARCHAR(255)  NULL,
    [telefon_mobil]  NVARCHAR(60)   NULL,
    [videno_at]      DATETIME2      NOT NULL,
    CONSTRAINT [helios_kontakty_pkey] PRIMARY KEY CLUSTERED ([cislo_subjektu])
);
GO
