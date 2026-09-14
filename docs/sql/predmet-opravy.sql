-- Předmět opravy u zakázky
--
-- Spusť CELÝ tenhle soubor v databázi RenoWorkshop na RENDCAPPu.
-- Jde pustit opakovaně - co už existuje, přeskočí.
--
-- Založí tabulku dilenske_udaje: údaje zakázky, které vede dílna ručně
-- a Helios je nezná. Zatím jen předmět opravy. Synchronizace z Heliosu
-- na ni nikdy nesahá.
--
-- Pozor na pořadí: tabulku založ DŘÍV, než nasadíš novou verzi služby.
-- Nová verze se na ni ptá u každé zakázky a bez ní by seznam nešel načíst.

USE RenoWorkshop;
GO

IF OBJECT_ID('dbo.dilenske_udaje') IS NULL
BEGIN
    CREATE TABLE [dbo].[dilenske_udaje] (
        [cislo_zakazky]  NVARCHAR(40)   NOT NULL,
        [predmet_opravy] NVARCHAR(1000) NULL,
        [upravil_kdo]    NVARCHAR(200)  NULL,
        [upravil_uid]    NVARCHAR(128)  NULL,
        [upraveno_at]    DATETIME2      NOT NULL
            CONSTRAINT [dilenske_udaje_upraveno_at_df] DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT [dilenske_udaje_pkey] PRIMARY KEY CLUSTERED ([cislo_zakazky])
    );

    ALTER TABLE [dbo].[dilenske_udaje]
        ADD CONSTRAINT [dilenske_udaje_cislo_zakazky_fkey]
        FOREIGN KEY ([cislo_zakazky])
        REFERENCES [dbo].[helios_zakazky]([cislo_zakazky])
        ON DELETE CASCADE ON UPDATE CASCADE;
END
GO
