-- Tabulky databáze RenoWorkshop.
--
-- Vygenerováno z prisma/schema.prisma:
--   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
--
-- Pouštět v databázi RenoWorkshop na RENDCAPPu. Kdo radši nechá zakládání
-- na službě, použije místo toho `npx prisma migrate deploy` - výsledek je
-- stejný, tohle je pro ty, kdo chtějí mít nad DDL kontrolu z SSMS.
--
-- Skript je v transakci: když cokoli selže, neprovede se nic.
--
-- Zdroj pravdy zůstává schema.prisma. Když se změní, vygeneruj skript znovu,
-- neupravuj ho ručně.

BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[helios_zakazky] (
    [cislo_zakazky] NVARCHAR(40) NOT NULL,
    [spz] NVARCHAR(20),
    [vin] NVARCHAR(30),
    [model] NVARCHAR(200),
    [zakaznik] NVARCHAR(200),
    [utvar_kod] NVARCHAR(20),
    [utvar_nazev] NVARCHAR(200),
    [datum_prijeti] DATETIME2,
    [termin_dokonceni] DATETIME2,
    [stav_real_cislo] INT,
    [stav_real_nazev] NVARCHAR(100),
    [videno_at] DATETIME2 NOT NULL,
    CONSTRAINT [helios_zakazky_pkey] PRIMARY KEY CLUSTERED ([cislo_zakazky])
);

-- CreateTable
CREATE TABLE [dbo].[helios_ukony] (
    [id] NVARCHAR(60) NOT NULL,
    [cislo_zakazky] NVARCHAR(40) NOT NULL,
    [nazev] NVARCHAR(500) NOT NULL,
    [hotovo] BIT NOT NULL CONSTRAINT [helios_ukony_hotovo_df] DEFAULT 0,
    [normohodiny] DECIMAL(6,2),
    CONSTRAINT [helios_ukony_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[dilenske_stavy] (
    [cislo_zakazky] NVARCHAR(40) NOT NULL,
    [stav] NVARCHAR(40) NOT NULL,
    [stani] NVARCHAR(60),
    [zmeneno_kym] NVARCHAR(200),
    [zmeneno_uid] NVARCHAR(128),
    [zmeneno_at] DATETIME2 NOT NULL,
    CONSTRAINT [dilenske_stavy_pkey] PRIMARY KEY CLUSTERED ([cislo_zakazky])
);

-- CreateTable
CREATE TABLE [dbo].[poznamky] (
    [id] NVARCHAR(40) NOT NULL,
    [cislo_zakazky] NVARCHAR(40) NOT NULL,
    [text] NVARCHAR(max) NOT NULL,
    [autor] NVARCHAR(200) NOT NULL,
    [autor_uid] NVARCHAR(128),
    [vytvoreno_at] DATETIME2 NOT NULL CONSTRAINT [poznamky_vytvoreno_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [poznamky_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[synchronizace] (
    [id] INT NOT NULL IDENTITY(1,1),
    [zacatek_at] DATETIME2 NOT NULL,
    [konec_at] DATETIME2,
    [pocet_zakazek] INT,
    [chyba] NVARCHAR(max),
    CONSTRAINT [synchronizace_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [helios_zakazky_utvar_kod_idx] ON [dbo].[helios_zakazky]([utvar_kod]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [helios_ukony_cislo_zakazky_idx] ON [dbo].[helios_ukony]([cislo_zakazky]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [poznamky_cislo_zakazky_vytvoreno_at_idx] ON [dbo].[poznamky]([cislo_zakazky], [vytvoreno_at]);

-- AddForeignKey
ALTER TABLE [dbo].[helios_ukony] ADD CONSTRAINT [helios_ukony_cislo_zakazky_fkey] FOREIGN KEY ([cislo_zakazky]) REFERENCES [dbo].[helios_zakazky]([cislo_zakazky]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[dilenske_stavy] ADD CONSTRAINT [dilenske_stavy_cislo_zakazky_fkey] FOREIGN KEY ([cislo_zakazky]) REFERENCES [dbo].[helios_zakazky]([cislo_zakazky]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[poznamky] ADD CONSTRAINT [poznamky_cislo_zakazky_fkey] FOREIGN KEY ([cislo_zakazky]) REFERENCES [dbo].[helios_zakazky]([cislo_zakazky]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

