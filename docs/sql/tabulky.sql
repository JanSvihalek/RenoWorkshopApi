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
    [typ_kod] NVARCHAR(20),
    [datum_prijeti] DATETIME2,
    [termin_dokonceni] DATETIME2,
    [stav_real_cislo] INT,
    [stav_real_nazev] NVARCHAR(100),
    [videno_at] DATETIME2 NOT NULL,
    [je_aktivni] BIT NOT NULL CONSTRAINT [helios_zakazky_je_aktivni_df] DEFAULT 1,
    [uzavrena_at] DATETIME2,
    CONSTRAINT [helios_zakazky_pkey] PRIMARY KEY CLUSTERED ([cislo_zakazky])
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
CREATE NONCLUSTERED INDEX [helios_zakazky_je_aktivni_termin_dokonceni_idx] ON [dbo].[helios_zakazky]([je_aktivni], [termin_dokonceni]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [helios_zakazky_spz_idx] ON [dbo].[helios_zakazky]([spz]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [helios_zakazky_vin_idx] ON [dbo].[helios_zakazky]([vin]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [poznamky_cislo_zakazky_vytvoreno_at_idx] ON [dbo].[poznamky]([cislo_zakazky], [vytvoreno_at]);

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

-- ---------------------------------------------------------------------
-- Typ (řada) zakázky - přidáno později
-- ---------------------------------------------------------------------
--
-- Helios vrací jen číslo řady (`rada.reference_subjektu`). Názvy k němu
-- drží tahle databáze, ne Helios: číslo je stabilní klíč, kdežto název
-- se dá v Heliosu přepsat. Úprava názvu se v telefonech projeví hned,
-- bez nasazování a bez nové verze aplikace.
--
-- Skript je spustitelný opakovaně.

IF COL_LENGTH('dbo.helios_zakazky', 'typ_kod') IS NULL
    ALTER TABLE [dbo].[helios_zakazky] ADD [typ_kod] NVARCHAR(20);
GO

IF OBJECT_ID('dbo.typy_zakazek') IS NULL
    CREATE TABLE [dbo].[typy_zakazek] (
        [kod] NVARCHAR(20) NOT NULL,
        [nazev] NVARCHAR(100) NOT NULL,
        CONSTRAINT [typy_zakazek_pkey] PRIMARY KEY CLUSTERED ([kod])
    );
GO

-- Názvy podle číselníku řad v Heliosu. Krátké schválně - na kartu
-- zakázky se dlouhý text nevejde a ořízne se třemi tečkami.
-- Doplnit další řadu = jeden INSERT, přejmenovat = jeden UPDATE.
MERGE [dbo].[typy_zakazek] AS cil
USING (VALUES
    (N'801', N'Běžná'),
    (N'802', N'Interní'),
    (N'803', N'PDI'),
    (N'806', N'Montáž'),
    (N'807', N'Prodej příslušenství'),
    (N'808', N'Zaměstnanecká')
) AS zdroj ([kod], [nazev])
    ON cil.[kod] = zdroj.[kod]
-- Bez WHEN MATCHED schválně: ruční úpravu názvu skript nepřepíše.
WHEN NOT MATCHED THEN
    INSERT ([kod], [nazev]) VALUES (zdroj.[kod], zdroj.[nazev]);
GO

-- Řada, která v tabulce chybí, se v appce ukáže jako holé číslo - je pak
-- vidět, že přibyla. Zakázka nikdy nezmizí. Co takhle chybí:
--   SELECT DISTINCT z.typ_kod
--   FROM dbo.helios_zakazky AS z
--        LEFT JOIN dbo.typy_zakazek AS t ON z.typ_kod = t.kod
--   WHERE z.typ_kod IS NOT NULL AND t.kod IS NULL;
