-- Příjem vozidla: checklist kontrol
--
-- Spusť CELÝ tenhle soubor v databázi RenoWorkshop na RENDCAPPu.
-- Jde pustit opakovaně - co už existuje, přeskočí.
--
-- Co udělá:
--   1. založí číselník prijem_kontroly_ciselnik a naplní ho devíti body
--      z papírového formuláře příjmu,
--   2. založí tabulku prijmy (jeden příjem na zakázku),
--   3. založí tabulku prijem_polozky (vyplněné body checklistu).
--
-- Pořadí: tenhle skript DŘÍV, než se nasadí nová verze služby.
-- Nic v Heliosu se nemění, sahá se jen do databáze RenoWorkshop.

USE RenoWorkshop;
GO

-- 1. Číselník kontrol. Typ 'kontrola' = zaškrtnout, 'datum' = zapsat datum.
IF OBJECT_ID('dbo.prijem_kontroly_ciselnik') IS NULL
    CREATE TABLE [dbo].[prijem_kontroly_ciselnik] (
        [kod] NVARCHAR(40) NOT NULL,
        [nazev] NVARCHAR(200) NOT NULL,
        [typ] NVARCHAR(20) NOT NULL CONSTRAINT [prijem_kontroly_typ_df] DEFAULT N'kontrola',
        [poradi] INT NOT NULL CONSTRAINT [prijem_kontroly_poradi_df] DEFAULT 0,
        [je_aktivni] BIT NOT NULL CONSTRAINT [prijem_kontroly_aktivni_df] DEFAULT 1,
        CONSTRAINT [prijem_kontroly_ciselnik_pkey] PRIMARY KEY CLUSTERED ([kod]),
        CONSTRAINT [prijem_kontroly_typ_ck] CHECK ([typ] IN (N'kontrola', N'datum'))
    );
GO

-- 2. Příjem k zakázce.
IF OBJECT_ID('dbo.prijmy') IS NULL
    CREATE TABLE [dbo].[prijmy] (
        [cislo_zakazky] NVARCHAR(40) NOT NULL,
        [zahajil_kdo] NVARCHAR(200),
        [zahajil_uid] NVARCHAR(128),
        [zahajeno_at] DATETIME2 NOT NULL CONSTRAINT [prijmy_zahajeno_df] DEFAULT SYSDATETIME(),
        -- NULL = rozpracovaný
        [dokoncil_kdo] NVARCHAR(200),
        [dokoncil_uid] NVARCHAR(128),
        [dokonceno_at] DATETIME2,
        CONSTRAINT [prijmy_pkey] PRIMARY KEY CLUSTERED ([cislo_zakazky]),
        CONSTRAINT [prijmy_zakazka_fkey] FOREIGN KEY ([cislo_zakazky])
            REFERENCES [dbo].[helios_zakazky]([cislo_zakazky])
            ON DELETE CASCADE ON UPDATE CASCADE
    );
GO

-- 3. Vyplněné body. Název a typ v době vyplnění.
IF OBJECT_ID('dbo.prijem_polozky') IS NULL
    CREATE TABLE [dbo].[prijem_polozky] (
        [cislo_zakazky] NVARCHAR(40) NOT NULL,
        [kod] NVARCHAR(40) NOT NULL,
        [nazev] NVARCHAR(200) NOT NULL,
        [typ] NVARCHAR(20) NOT NULL,
        [splneno] BIT NOT NULL CONSTRAINT [prijem_polozky_splneno_df] DEFAULT 0,
        -- u typu 'datum' ve tvaru RRRR-MM-DD
        [hodnota] NVARCHAR(40),
        [poznamka] NVARCHAR(500),
        [zmenil_kdo] NVARCHAR(200),
        [zmenil_uid] NVARCHAR(128),
        [zmeneno_at] DATETIME2 NOT NULL CONSTRAINT [prijem_polozky_zmeneno_df] DEFAULT SYSDATETIME(),
        CONSTRAINT [prijem_polozky_pkey] PRIMARY KEY CLUSTERED ([cislo_zakazky], [kod]),
        CONSTRAINT [prijem_polozky_prijem_fkey] FOREIGN KEY ([cislo_zakazky])
            REFERENCES [dbo].[prijmy]([cislo_zakazky])
            ON DELETE CASCADE ON UPDATE CASCADE
    );
GO

-- Body z formuláře příjmu. Uprav si názvy nebo pořadí, jak potřebuješ -
-- skript hotové položky nepřepisuje. Novou kontrolu stačí přidat řádkem
-- do tabulky, vyřazenou označit je_aktivni = 0.
MERGE [dbo].[prijem_kontroly_ciselnik] AS cil
USING (VALUES
    (N'sklo_sterace',  N'FCE/poškození: stěrače, ostřikovače, čelní sklo',         N'kontrola', 10),
    (N'stk',           N'Datum platnosti STK',                                     N'datum',    20),
    (N'adblue',        N'Množství AdBlue, ostřikovače',                            N'kontrola', 30),
    (N'cbs',           N'CBS data (kontrola nadcházejícího) + přítomnost TA',      N'kontrola', 40),
    (N'osvetleni',     N'Kontrola osvětlení: přední, zadní, SPZ',                  N'kontrola', 50),
    (N'brzdy',         N'Brzdy: destičky, kotouče, hadičky',                       N'kontrola', 60),
    (N'motor',         N'Motor + převodovka: úniky kapalin, řemeny',               N'kontrola', 70),
    (N'napravy',       N'Kontrola náprav + stav pneu + spodní kryty vozidla',      N'kontrola', 80),
    (N'kapaliny',      N'Kapaliny: olej, chladicí kapalina',                       N'kontrola', 90)
) AS zdroj ([kod], [nazev], [typ], [poradi])
    ON cil.[kod] = zdroj.[kod]
WHEN NOT MATCHED THEN
    INSERT ([kod], [nazev], [typ], [poradi])
    VALUES (zdroj.[kod], zdroj.[nazev], zdroj.[typ], zdroj.[poradi]);
GO
