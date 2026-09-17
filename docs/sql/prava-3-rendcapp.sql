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
-- Služba může běžet. Když krok E shodí synchronizaci, vrácení je na konci.

USE master;
GO

-- A. Jmenovité mapování na linkovaném serveru - jen pro login renoworkshop.
--    Catch-all pro ostatní loginy zůstává, jak je (viz skript 1, A6).
--    Bez tohohle padá nesysadmin login na chybě 7416 (zkoušeno v srpnu).
EXEC sp_addlinkedsrvlogin
    @rmtsrvname  = N'RAS_HEN',
    @useself     = N'FALSE',
    @locallogin  = N'renoworkshop',
    @rmtuser     = N'renoworkshop',
    @rmtpassword = N'<HESLO ÚČTU renoworkshop NA HELIOSU>';
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
