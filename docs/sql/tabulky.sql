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
    [rada_reference] NVARCHAR(50),
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
-- Řada zakázky - přidáno později
-- ---------------------------------------------------------------------
--
-- Helios vrací jen číslo řady (`rada.reference_subjektu`). Názvy k němu
-- drží tahle databáze, ne Helios: číslo je stabilní klíč, kdežto název
-- se dá v Heliosu přepsat. Úprava názvu se v telefonech projeví hned,
-- bez nasazování a bez nové verze aplikace.
--
-- Skript je spustitelný opakovaně a poradí si i s dřívějším pojmenováním
-- (`typ_kod`, `kod`, `nazev`), kdyby už bylo nasazené.

IF COL_LENGTH('dbo.helios_zakazky', 'rada_reference') IS NULL
BEGIN
    IF COL_LENGTH('dbo.helios_zakazky', 'typ_kod') IS NOT NULL
        EXEC sp_rename 'dbo.helios_zakazky.typ_kod', 'rada_reference', 'COLUMN';
    ELSE
        ALTER TABLE [dbo].[helios_zakazky] ADD [rada_reference] NVARCHAR(50);
END
GO

-- Hodnota z Heliosu se do 20 znaků nevešla (P2000 při synchronizaci),
-- proto se sloupec ještě rozšiřuje. Na už založené databázi to doběhne
-- takhle; na čisté se rovnou zakládá širší.
IF COL_LENGTH('dbo.helios_zakazky', 'rada_reference') < 100
    ALTER TABLE [dbo].[helios_zakazky]
        ALTER COLUMN [rada_reference] NVARCHAR(50);
GO

-- Sloupec typ_nazev se už nepoužívá - název se bere z převodní tabulky,
-- aby ho stačilo přepsat na jednom místě. Zahodit se dá takhle; nechávám
-- to na tobě, mazání sloupce je nevratné:
--   IF COL_LENGTH('dbo.helios_zakazky', 'typ_nazev') IS NOT NULL
--       ALTER TABLE [dbo].[helios_zakazky] DROP COLUMN [typ_nazev];

IF OBJECT_ID('dbo.typy_zakazek') IS NULL
    CREATE TABLE [dbo].[typy_zakazek] (
        [rada_reference] NVARCHAR(20) NOT NULL,
        [rada_zakazek] NVARCHAR(100) NOT NULL,
        CONSTRAINT [typy_zakazek_pkey] PRIMARY KEY CLUSTERED ([rada_reference])
    );
GO

-- Přejmenování z dřívější podoby tabulky.
IF COL_LENGTH('dbo.typy_zakazek', 'kod') IS NOT NULL
    EXEC sp_rename 'dbo.typy_zakazek.kod', 'rada_reference', 'COLUMN';
GO
IF COL_LENGTH('dbo.typy_zakazek', 'nazev') IS NOT NULL
    EXEC sp_rename 'dbo.typy_zakazek.nazev', 'rada_zakazek', 'COLUMN';
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
) AS zdroj ([rada_reference], [rada_zakazek])
    ON cil.[rada_reference] = zdroj.[rada_reference]
-- Bez WHEN MATCHED schválně: ruční úpravu názvu skript nepřepíše.
WHEN NOT MATCHED THEN
    INSERT ([rada_reference], [rada_zakazek])
    VALUES (zdroj.[rada_reference], zdroj.[rada_zakazek]);
GO

-- Řada, která v tabulce chybí, se v appce ukáže jako holé číslo - je pak
-- vidět, že přibyla. Zakázka nikdy nezmizí. Co takhle chybí:
--   SELECT DISTINCT z.rada_reference
--   FROM dbo.helios_zakazky AS z
--        LEFT JOIN dbo.typy_zakazek AS t
--             ON z.rada_reference = t.rada_reference
--   WHERE z.rada_reference IS NOT NULL AND t.rada_reference IS NULL;

-- ---------------------------------------------------------------------
-- Dílenské stavy: číselník a historie - přidáno později
-- ---------------------------------------------------------------------
--
-- Původně měla zakázka jeden přepisovaný dílenský stav ze sedmi pevně
-- daných. Na klempírně to nestačí: oprava po bouračce běží týdny, stavy
-- se vracejí a je potřeba vidět, kdy se co stalo a jak dlouho se na co
-- čekalo. Stav se proto **přidává** a drží se celá historie.
--
-- Skript je spustitelný opakovaně a stará data převede.

-- 1. Číselník toho, co jde vybrat z nabídky.
IF OBJECT_ID('dbo.dilenske_stavy_ciselnik') IS NULL
    CREATE TABLE [dbo].[dilenske_stavy_ciselnik] (
        [kod] NVARCHAR(40) NOT NULL,
        [nazev] NVARCHAR(100) NOT NULL,
        [poradi] INT NOT NULL CONSTRAINT [dilenske_stavy_ciselnik_poradi_df] DEFAULT 0,
        [je_aktivni] BIT NOT NULL CONSTRAINT [dilenske_stavy_ciselnik_aktivni_df] DEFAULT 1,
        CONSTRAINT [dilenske_stavy_ciselnik_pkey] PRIMARY KEY CLUSTERED ([kod])
    );
GO

-- 2. Historie. Poslední záznam zakázky je ten platný.
IF OBJECT_ID('dbo.dilenske_zaznamy') IS NULL
    CREATE TABLE [dbo].[dilenske_zaznamy] (
        [id] NVARCHAR(30) NOT NULL,
        [cislo_zakazky] NVARCHAR(40) NOT NULL,
        -- NULL = ručně zapsaný stav („Jiný"), jinak kód z číselníku.
        [kod] NVARCHAR(40),
        -- Text v době zápisu; přejmenování v číselníku historii nemění.
        [nazev] NVARCHAR(100) NOT NULL,
        [zadal_kdo] NVARCHAR(200),
        [zadal_uid] NVARCHAR(128),
        [zadano_at] DATETIME2 NOT NULL CONSTRAINT [dilenske_zaznamy_zadano_df] DEFAULT SYSDATETIME(),
        CONSTRAINT [dilenske_zaznamy_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [dilenske_zaznamy_zakazka_fkey] FOREIGN KEY ([cislo_zakazky])
            REFERENCES [dbo].[helios_zakazky]([cislo_zakazky]) ON DELETE CASCADE
    );
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'dilenske_zaznamy_zakazka_idx')
    CREATE INDEX [dilenske_zaznamy_zakazka_idx]
        ON [dbo].[dilenske_zaznamy]([cislo_zakazky], [zadano_at]);
GO

-- 3. Stání se stěhuje na zakázku - s dílenským stavem nesouvisí.
IF COL_LENGTH('dbo.helios_zakazky', 'stani') IS NULL
    ALTER TABLE [dbo].[helios_zakazky] ADD [stani] NVARCHAR(60);
GO

-- 4. Výchozí číselník. Jen návrh podle běžného sledu prací na klempírně -
--    uprav si ho, jak potřebuješ. Skript hotové položky nepřepisuje.
MERGE [dbo].[dilenske_stavy_ciselnik] AS cil
USING (VALUES
    (N'prijato',        N'Přijato',                      10),
    (N'prohlidka',      N'Prohlídka a nafocení',         20),
    (N'rozpocet',       N'Rozpočet',                     30),
    (N'ceka_pojistovna',N'Čeká na pojišťovnu',           40),
    (N'objednano',      N'Díly objednány',               50),
    (N'ceka_dily',      N'Čeká na díly',                 60),
    (N'demontaz',       N'Demontáž',                     70),
    (N'klempirna',      N'Klempířské práce',             80),
    (N'priprava_lak',   N'Příprava na lak',              90),
    (N'lakovna',        N'Lakovna',                     100),
    (N'montaz',         N'Montáž',                      110),
    (N'kontrola',       N'Kontrola',                    120),
    (N'pripraveno',     N'Připraveno k vyzvednutí',     130),
    (N'vyzvednuto',     N'Vyzvednuto',                  140)
) AS zdroj ([kod], [nazev], [poradi])
    ON cil.[kod] = zdroj.[kod]
WHEN NOT MATCHED THEN
    INSERT ([kod], [nazev], [poradi])
    VALUES (zdroj.[kod], zdroj.[nazev], zdroj.[poradi]);
GO

-- 5. Převod starých stavů do historie. Proběhne jen jednou: u zakázky,
--    která už nějaký záznam má, se nic nepřidává.
IF OBJECT_ID('dbo.dilenske_stavy') IS NOT NULL
BEGIN
    INSERT INTO [dbo].[dilenske_zaznamy]
        ([id], [cislo_zakazky], [kod], [nazev], [zadal_kdo], [zadal_uid], [zadano_at])
    SELECT
        LEFT(CONVERT(NVARCHAR(36), NEWID()), 30),
        s.[cislo_zakazky],
        CASE s.[stav]
            WHEN 'received'          THEN N'prijato'
            WHEN 'waiting_for_parts' THEN N'ceka_dily'
            WHEN 'in_repair'         THEN N'klempirna'
            WHEN 'quality_check'     THEN N'kontrola'
            WHEN 'ready_for_pickup'  THEN N'pripraveno'
            WHEN 'picked_up'         THEN N'vyzvednuto'
            ELSE NULL
        END,
        CASE s.[stav]
            WHEN 'received'          THEN N'Přijato'
            WHEN 'diagnostics'       THEN N'Diagnostika'
            WHEN 'waiting_for_parts' THEN N'Čeká na díly'
            WHEN 'in_repair'         THEN N'V opravě'
            WHEN 'quality_check'     THEN N'Kontrola'
            WHEN 'ready_for_pickup'  THEN N'Připraveno k vyzvednutí'
            WHEN 'picked_up'         THEN N'Vyzvednuto'
            ELSE s.[stav]
        END,
        s.[zmeneno_kym],
        s.[zmeneno_uid],
        s.[zmeneno_at]
    FROM [dbo].[dilenske_stavy] AS s
    WHERE NOT EXISTS (
        SELECT 1 FROM [dbo].[dilenske_zaznamy] AS z
        WHERE z.[cislo_zakazky] = s.[cislo_zakazky]
    );

    -- Stání ze staré tabulky na zakázku.
    UPDATE z
       SET z.[stani] = s.[stani]
      FROM [dbo].[helios_zakazky] AS z
           JOIN [dbo].[dilenske_stavy] AS s ON s.[cislo_zakazky] = z.[cislo_zakazky]
     WHERE s.[stani] IS NOT NULL AND z.[stani] IS NULL;
END
GO

-- 6. Starou tabulku nech zatím být. Až ověříš, že historie sedí, smaž ji:
--      DROP TABLE [dbo].[dilenske_stavy];
--    Dřív ne - je to jediná kopie původních stavů.
