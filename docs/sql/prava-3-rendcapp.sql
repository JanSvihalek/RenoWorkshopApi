-- Práva databázových účtů RenoWorkshopu - 3. LOGIN SLUŽBY BEZ SYSADMIN
--
-- Spouští se na RENDCAPPu, admin. Po skriptu 1 (část A); nezávisí na
-- skriptu 2, ale smysl dává až oba.
--
-- Cíl: login renoworkshop (služba i ruční npm run zrcadla/historie/zavady)
-- smí jen číst a zapisovat data v databázi RenoWorkshop. Žádné jiné
-- databáze, žádné změny struktury, žádná správa serveru.
--
-- !!! Do kroku A se vkládá heslo účtu na Heliosu. Soubor s heslem
-- !!! NEUKLÁDEJ a necommituj - heslo vlož jen do okna SSMS.
--
-- Služba může běžet. Když krok E shodí synchronizaci, vrácení je u kroku G.
-- Krok H (zrušení catch-all) spouštěj zvlášť, až služba po kroku G běží.

USE master;
GO

-- A. Jmenovitá mapování na linkovaném serveru místo catch-all:
--    - login služby renoworkshop (bez toho padá nesysadmin login na 7416,
--      zkoušeno v srpnu),
--    - login, pod kterým tenhle skript pouštíš - úpravy pohledů
--      (CREATE/ALTER VIEW) se při uložení ověřují proti Heliosu a bez
--      mapování by po kroku H skončily také na 7416.
--    Oba jdou do Heliosu stejným účtem jen pro čtení (skript 2).
DECLARE @heslo nvarchar(128) = N'<HESLO ÚČTU renoworkshop NA HELIOSU>';
DECLARE @admin sysname = SUSER_SNAME();

EXEC sp_addlinkedsrvlogin
    @rmtsrvname  = N'RAS_HEN',
    @useself     = N'FALSE',
    @locallogin  = N'renoworkshop',
    @rmtuser     = N'renoworkshop',
    @rmtpassword = @heslo;

IF @admin <> N'renoworkshop'
    EXEC sp_addlinkedsrvlogin
        @rmtsrvname  = N'RAS_HEN',
        @useself     = N'FALSE',
        @locallogin  = @admin,
        @rmtuser     = N'renoworkshop',
        @rmtpassword = @heslo;

SELECT COALESCE(p.name, N'(catch-all)') AS mapovany_login, ll.remote_name
FROM sys.servers AS s
JOIN sys.linked_logins AS ll ON ll.server_id = s.server_id
LEFT JOIN sys.server_principals AS p ON p.principal_id = ll.local_principal_id
WHERE s.name = N'RAS_HEN';
GO

-- B. Vlastník databáze. Kdyby databázi vlastnil renoworkshop, byl by v ní
--    dbo i bez sysadmin.
IF (SELECT SUSER_SNAME(owner_sid) FROM sys.databases WHERE name = N'RenoWorkshop') = N'renoworkshop'
    ALTER AUTHORIZATION ON DATABASE::RenoWorkshop TO sa;
GO

-- C. Uživatel v databázi RenoWorkshop se čtením a zápisem dat.
--    db_datareader = SELECT na tabulky i pohledy nad Heliosem,
--    db_datawriter = INSERT/UPDATE/DELETE (MERGE synchronizace, stavy,
--    poznámky, fotky, příjem). Změny struktury (nové tabulky ze skriptů
--    v docs/sql) dál pouští admin.
USE RenoWorkshop;
GO
IF USER_ID(N'renoworkshop') IS NULL
    CREATE USER renoworkshop FOR LOGIN renoworkshop;
GO
EXEC sp_addrolemember N'db_datareader', N'renoworkshop';
EXEC sp_addrolemember N'db_datawriter', N'renoworkshop';
GO
-- db_owner pryč - zjištěno v září 2026 (skript 1, A4). S ním by login
-- i bez sysadmin mohl měnit strukturu, mazat tabulky a přidělovat práva.
IF IS_ROLEMEMBER(N'db_owner', N'renoworkshop') = 1
    EXEC sp_droprolemember N'db_owner', N'renoworkshop';
GO

-- D. Výchozí databáze loginu, ať se po odebrání sysadmin nepřipojuje
--    do master.
ALTER LOGIN renoworkshop WITH DEFAULT_DATABASE = RenoWorkshop;
GO

-- E. Odebrání sysadmin.
EXEC sp_dropsrvrolemember N'renoworkshop', N'sysadmin';
GO

-- F. Ověření pod loginem služby. Musí projít čtení přes linkovaný server
--    a nesmí projít nic mimo databázi RenoWorkshop.
USE RenoWorkshop;
GO
EXECUTE AS LOGIN = N'renoworkshop';
SELECT IS_SRVROLEMEMBER('sysadmin') AS stale_sysadmin;         -- 0
SELECT TOP 5 * FROM dbo.v_renoworkshop_zakazky;                  -- vrátí zakázky
SELECT HAS_PERMS_BY_NAME(N'dbo.helios_zakazky', N'OBJECT', N'UPDATE') AS zapisuje_zakazky;  -- 1
SELECT HAS_PERMS_BY_NAME(N'RenoWorkshop', N'DATABASE', N'ALTER') AS meni_strukturu;          -- 0
SELECT IS_ROLEMEMBER(N'db_owner') AS je_db_owner;                                            -- 0
SELECT HAS_PERMS_BY_NAME(NULL, NULL, N'CONTROL SERVER') AS spravuje_server;                  -- 0
REVERT;
GO

-- G. Pak restartuj službu a ověř:
--    - Invoke-RestMethod http://localhost:8092/health  -> chybaSynchronizace = null
--      (po nejbližším pětiminutovém běhu)
--    - v aplikaci přidat a smazat poznámku, zaškrtnout kontrolu v příjmu
--    - ruční běh: npm run zavady

-- ---------------------------------------------------------------------
-- VRÁCENÍ, kdyby synchronizace padala:
--   EXEC sp_addsrvrolemember N'renoworkshop', N'sysadmin';
-- a poslat chybu z /health nebo z konzole služby.
-- ---------------------------------------------------------------------


-- H. Zrušení catch-all - AŽ PO KROKU G, když služba běží bez chyb.
--
--    Dnes se do Heliosu jako renoworkshop hlásí KAŽDÝ login na RENDCAPPu,
--    a RENDCAPP hostí i cizí aplikace. Kontrola v září 2026: RAS_HEN
--    nepoužívá žádný pohled, procedura ani úloha mimo RenoWorkshop a cache
--    dotazů je prázdná. Po zrušení smí do Heliosu jen loginy z kroku A.
USE master;
GO
EXEC sp_droplinkedsrvlogin @rmtsrvname = N'RAS_HEN', @locallogin = NULL;
GO

-- Ověření: služba i admin dál čtou, jiný login ne.
USE RenoWorkshop;
GO
SELECT TOP 1 * FROM dbo.v_renoworkshop_zavady;          -- admin: projde
EXECUTE AS LOGIN = N'renoworkshop';
SELECT TOP 1 * FROM dbo.v_renoworkshop_zavady;          -- služba: projde
REVERT;
GO

-- VRÁCENÍ catch-all, kdyby se ozvala jiná aplikace s chybou 7416
-- „no login-mapping exists" (heslo stejné jako v kroku A):
--   EXEC sp_addlinkedsrvlogin @rmtsrvname = N'RAS_HEN', @useself = N'FALSE',
--        @locallogin = NULL, @rmtuser = N'renoworkshop',
--        @rmtpassword = N'<HESLO>';
-- Správná oprava je pak ale vlastní účet na Heliosu pro tu aplikaci,
-- ne vracet jí přístup přes účet RenoWorkshopu.
