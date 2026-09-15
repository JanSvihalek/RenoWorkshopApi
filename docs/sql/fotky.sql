-- Fotodokumentace zakázek
--
-- Spusť CELÝ tenhle soubor v databázi RenoWorkshop na RENDCAPPu.
-- Jde pustit opakovaně - co už existuje, přeskočí.
--
-- 1. K pořadačům přidá složku pobočky, do které jdou fotky zakázek.
-- 2. Založí tabulku fotky - záznamy o fotkách. Soubory samotné leží ve
--    sdílené složce na RENDCFILE (FOTO_ADRESAR v .env služby).
--
-- Cesta fotky:
--   \\renocar.local\share\Foto-doc\<složka pobočky>\<číslo zakázky>\<kategorie>\<čas>-<id>.jpg
--
-- Pořadí: tenhle skript DŘÍV, než se nasadí nová verze služby.

USE RenoWorkshop;
GO

IF COL_LENGTH('dbo.poradace', 'slozka') IS NULL
    ALTER TABLE [dbo].[poradace] ADD [slozka] NVARCHAR(50) NULL;
GO

-- Přiřazení pořadačů ke složkám poboček. ZKONTROLUJ před spuštěním.
-- Přepisuje se jen tam, kde složka ještě není vyplněná.
UPDATE p SET slozka = v.slozka
FROM dbo.poradace AS p
JOIN (VALUES
    (10026, N'Brno'),      -- BMW BSL
    (16877, N'Brno'),      -- MOT BSL
    (16015, N'Cestlice'),  -- BMW CLI
    (16879, N'Ceska'),     -- BMW CSK
    (17362, N'Ceska'),     -- MOT CSK
    (16017, N'KCP'),       -- BMW PKC
    (17350, N'Bubenec')    -- BMW PBU
) AS v (cislo, slozka) ON v.cislo = p.cislo_poradace
WHERE p.slozka IS NULL;
GO

IF OBJECT_ID('dbo.fotky') IS NULL
BEGIN
    CREATE TABLE [dbo].[fotky] (
        [id]            NVARCHAR(30)  NOT NULL,
        [cislo_zakazky] NVARCHAR(40)  NOT NULL,
        [kategorie]     NVARCHAR(40)  NOT NULL,
        [cesta]         NVARCHAR(400) NOT NULL,
        [velikost]      INT           NOT NULL,
        [nahral_kdo]    NVARCHAR(200) NULL,
        [nahral_uid]    NVARCHAR(128) NULL,
        [nahrano_at]    DATETIME2     NOT NULL,
        CONSTRAINT [fotky_pkey] PRIMARY KEY CLUSTERED ([id])
    );

    ALTER TABLE [dbo].[fotky]
        ADD CONSTRAINT [fotky_cislo_zakazky_fkey]
        FOREIGN KEY ([cislo_zakazky])
        REFERENCES [dbo].[helios_zakazky]([cislo_zakazky])
        ON DELETE CASCADE ON UPDATE CASCADE;

    CREATE INDEX [fotky_cislo_zakazky_nahrano_at_idx]
        ON [dbo].[fotky] ([cislo_zakazky], [nahrano_at]);
END
GO
