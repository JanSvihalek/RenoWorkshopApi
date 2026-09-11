-- Dílenské stavy: číselník a historie
--
-- Spusť CELÝ tenhle soubor v databázi RenoWorkshop na RENDCAPPu.
-- Jde pustit opakovaně - co už existuje, přeskočí.
--
-- Co udělá:
--   1. založí tabulku dilenske_stavy_ciselnik (nabídka stavů pro appku)
--      a naplní ji čtrnácti stavy podle běžného sledu na klempírně,
--   2. založí tabulku dilenske_zaznamy (historie stavů u zakázek),
--   3. přidá zakázce sloupec stani,
--   4. převede stávající dílenské stavy do historie,
--   5. starou tabulku dilenske_stavy NECHÁ BÝT - je to jediná kopie
--      původních dat, smaž ji, až si ověříš, že převod sedí.
--
-- Nic v Heliosu se nemění, sahá se jen do databáze RenoWorkshop.

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
