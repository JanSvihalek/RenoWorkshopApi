-- Práva databázových účtů RenoWorkshopu - 2. ÚČET NA HELIOSU JEN PRO ČTENÍ
--
-- Spouští se na SQL SERVERU HELIOSU, admin tamního serveru.
-- Nejdřív skript 1, část B. Tenhle skript upravit podle jeho výsledků.
--
-- Cíl: vzdálený účet renoworkshop (přes něj chodí linkovaný server RAS_HEN)
-- smí v RNC_ostra jen ČÍST tabulky, které pohledy RenoWorkshopu používají.
-- Nic jiného - ani db_datareader, ten by otevřel celou databázi.
--
-- Pořadí je schválně: nejdřív se čtení přidá, teprve pak se odeberou
-- široké role. Synchronizace tak nespadne ani na chvíli.
--
-- Seznam tabulek porovnej s výsledkem skriptu 1, dotaz A1 - pohledy se
-- upravují přímo na serveru a mohou číst i něco, co tu chybí.

USE RNC_ostra;
GO

-- 1. Uživatel v databázi. Sysadmin ho nepotřeboval; bez sysadmin by se
--    účet do RNC_ostra vůbec nedostal.
IF USER_ID(N'renoworkshop') IS NULL
    CREATE USER renoworkshop FOR LOGIN renoworkshop;
GO

-- 2. Čtení jen tabulek, které pohledy používají (stav září 2026).
GRANT SELECT ON lcs.ino_srvszak_hlavicka      TO renoworkshop;
GRANT SELECT ON lcs.uda_ino_srvszak_hlavicka  TO renoworkshop;
GRANT SELECT ON lcs.ino_srvszak_zakazka       TO renoworkshop;
GRANT SELECT ON lcs.ino_srvszak_zavady        TO renoworkshop;
GRANT SELECT ON lcs.attribute_valuation_entry TO renoworkshop;
GRANT SELECT ON lcs.subjekty                  TO renoworkshop;
GRANT SELECT ON lcs.organizace                TO renoworkshop;
GRANT SELECT ON lcs.kontaktni_osoby           TO renoworkshop;
GRANT SELECT ON lcs.ino_vozidlo               TO renoworkshop;
GRANT SELECT ON lcs.ino_znackamodel           TO renoworkshop;
GO

-- 3. Odebrání širokých databázových rolí (jen pokud v nich je).
IF IS_ROLEMEMBER(N'db_owner', N'renoworkshop') = 1
    EXEC sp_droprolemember N'db_owner', N'renoworkshop';
IF IS_ROLEMEMBER(N'db_datawriter', N'renoworkshop') = 1
    EXEC sp_droprolemember N'db_datawriter', N'renoworkshop';
IF IS_ROLEMEMBER(N'db_ddladmin', N'renoworkshop') = 1
    EXEC sp_droprolemember N'db_ddladmin', N'renoworkshop';
IF IS_ROLEMEMBER(N'db_datareader', N'renoworkshop') = 1
    EXEC sp_droprolemember N'db_datareader', N'renoworkshop';
GO

-- 4. Odebrání sysadmin na serveru Heliosu (jen pokud ho má).
--    Přímo přidělená práva ze skriptu 1, dotaz B3 (INSERT, EXECUTE...)
--    se automaticky NEODEBÍRAJÍ - projdi je a odeber ručně (REVOKE).
IF IS_SRVROLEMEMBER('sysadmin', N'renoworkshop') = 1
    EXEC sp_dropsrvrolemember N'renoworkshop', N'sysadmin';
GO

-- 5. Ověření - co účet teď smí. Očekává se: čtení 1, zápis 0,
--    v celé databázi jen CONNECT (případně SHOWPLAN a podobně), žádné
--    SELECT/INSERT/UPDATE/DELETE/ALTER/EXECUTE/CONTROL - SELECT na úrovni
--    databáze by znamenal čtení všech tabulek, ne jen těch deseti.
EXECUTE AS USER = N'renoworkshop';
SELECT permission_name AS muze_v_celé_databazi
FROM fn_my_permissions(NULL, N'DATABASE');
SELECT
    HAS_PERMS_BY_NAME(N'lcs.ino_srvszak_hlavicka', N'OBJECT', N'SELECT') AS cte_hlavicku,
    HAS_PERMS_BY_NAME(N'lcs.ino_srvszak_zavady', N'OBJECT', N'SELECT')   AS cte_zavady,
    HAS_PERMS_BY_NAME(N'lcs.ino_srvszak_hlavicka', N'OBJECT', N'INSERT') AS zapisuje_hlavicku,
    HAS_PERMS_BY_NAME(N'lcs.ino_srvszak_hlavicka', N'OBJECT', N'UPDATE') AS meni_hlavicku,
    HAS_PERMS_BY_NAME(N'lcs.ino_srvszak_hlavicka', N'OBJECT', N'DELETE') AS maze_hlavicku;
REVERT;
GO

-- Vrácení, kdyby synchronizace na RENDCAPPu začala padat na „SELECT
-- permission was denied": chybí GRANT pro tabulku, kterou pohled čte -
-- přidat ho (správná oprava), ne vracet role. Nouzově:
--   EXEC sp_addrolemember N'db_datareader', N'renoworkshop';
