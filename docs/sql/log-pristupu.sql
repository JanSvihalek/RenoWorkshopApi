-- Log přístupů do služby RenoWorkshop
--
-- Spusť CELÝ tenhle soubor v databázi RenoWorkshop na RENDCAPPu (admin).
-- Jde pustit opakovaně - co už existuje, přeskočí.
--
-- Co se ukládá: kdo (e-mail z přihlášení), kdy, jaký požadavek a u které
-- zakázky, jak dopadl, jak dlouho trval a chybová zpráva. NEUKLÁDÁ se obsah
-- požadavků - text poznámek, fotky ani hledaný text.
--
-- Účel: bezpečnost a dohledání chyb. Záznamy starší než 90 dní
-- (LOG_UCHOVANI_DNI) služba v noci maže.
--
-- Pořadí: tenhle skript DŘÍV, než se nasadí nová verze služby. Když tabulka
-- chybí, služba běží dál, jen nic nezapisuje a v konzoli varuje.

USE RenoWorkshop;
GO

IF OBJECT_ID('dbo.log_pristupu') IS NULL
    CREATE TABLE [dbo].[log_pristupu] (
        [id]        BIGINT IDENTITY(1, 1) NOT NULL,
        -- místní čas serveru
        [cas]       DATETIME2 NOT NULL CONSTRAINT [log_pristupu_cas_df] DEFAULT SYSDATETIME(),
        [email]     NVARCHAR(200),
        [uid]       NVARCHAR(128),
        [ip]        NVARCHAR(64),
        [metoda]    NVARCHAR(10) NOT NULL,
        [cesta]     NVARCHAR(200) NOT NULL,
        [zakazka]   NVARCHAR(40),
        [parametry] NVARCHAR(200),
        [stav]      INT NOT NULL,
        [trvani_ms] INT NOT NULL,
        [chyba]     NVARCHAR(2000),
        CONSTRAINT [log_pristupu_pkey] PRIMARY KEY CLUSTERED ([id])
    );
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'log_pristupu_cas_idx')
    CREATE INDEX [log_pristupu_cas_idx] ON [dbo].[log_pristupu] ([cas]);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'log_pristupu_email_cas_idx')
    CREATE INDEX [log_pristupu_email_cas_idx] ON [dbo].[log_pristupu] ([email], [cas]);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'log_pristupu_zakazka_cas_idx')
    CREATE INDEX [log_pristupu_zakazka_cas_idx] ON [dbo].[log_pristupu] ([zakazka], [cas]);
GO
