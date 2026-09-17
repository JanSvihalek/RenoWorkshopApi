-- Práva databázových účtů RenoWorkshopu - 1. ZJIŠTĚNÍ STAVU
--
-- NIC NEMĚNÍ, jen čte metadata. Má dvě části pro dva různé servery:
--   ČÁST A - spusť na RENDCAPPu (SSMS, přihlášený jako admin)
--   ČÁST B - spusť na SQL Serveru Heliosu (admin tamního serveru)
--
-- Výsledky pošli, podle nich se doladí skripty 2 a 3.
--
-- NESPOUŠTĚJ CELÝ SOUBOR NARAZ na jednom serveru. Na RENDCAPPu označ jen
-- část A a spusť označené (F5 spouští výběr); část B pak na serveru
-- Heliosu. Databáze RNC_ostra na RENDCAPPu není.


-- =====================================================================
-- ČÁST A - RENDCAPP
-- =====================================================================

-- A1. Které tabulky Heliosu pohledy OPRAVDU čtou (ze serveru, ne z gitu -
--     pohledy se upravují přímo v SSMS). Tyhle tabulky dostanou GRANT SELECT.
USE RenoWorkshop;
GO
SELECT DISTINCT
    d.referenced_database_name AS databaze,
    d.referenced_schema_name   AS schema_,
    d.referenced_entity_name   AS tabulka,
    OBJECT_NAME(d.referencing_id) AS pohled
FROM sys.sql_expression_dependencies AS d
WHERE d.referenced_server_name = N'RAS_HEN'
ORDER BY tabulka, pohled;

-- A2. Serverové role loginu renoworkshop (očekává se sysadmin).
SELECT r.name AS serverova_role
FROM sys.server_role_members AS m
JOIN sys.server_principals AS r ON r.principal_id = m.role_principal_id
JOIN sys.server_principals AS l ON l.principal_id = m.member_principal_id
WHERE l.name = N'renoworkshop';

-- A3. Vlastník databáze RenoWorkshop. Kdyby to byl renoworkshop, je v ní
--     dbo se vším všudy i bez sysadmin - skript 3 to přepne na sa.
SELECT SUSER_SNAME(owner_sid) AS vlastnik_databaze
FROM sys.databases
WHERE name = N'RenoWorkshop';

-- A4. Uživatel loginu v databázi RenoWorkshop a jeho role (může být prázdné -
--     sysadmin uživatele nepotřebuje).
SELECT dp.name AS uzivatel, r.name AS role
FROM sys.database_principals AS dp
LEFT JOIN sys.database_role_members AS m ON m.member_principal_id = dp.principal_id
LEFT JOIN sys.database_principals AS r ON r.principal_id = m.role_principal_id
WHERE dp.sid = SUSER_SID(N'renoworkshop');

-- A5. Mapování přihlášení na linkovaném serveru RAS_HEN.
SELECT
    COALESCE(p.name, N'(catch-all: všechny ostatní loginy)') AS lokalni_login,
    ll.uses_self_credential,
    ll.remote_name AS vzdaleny_ucet
FROM sys.servers AS s
JOIN sys.linked_logins AS ll ON ll.server_id = s.server_id
LEFT JOIN sys.server_principals AS p ON p.principal_id = ll.local_principal_id
WHERE s.name = N'RAS_HEN';

-- A5b. Na který server a pod jakým jménem RAS_HEN míří - tam se pouští část B.
SELECT name AS linkovany_server, data_source AS server_heliosu, catalog AS databaze
FROM sys.servers
WHERE name = N'RAS_HEN';

-- A6. Kdo DALŠÍ používá RAS_HEN - pohledy a procedury ve všech databázích
--     a úlohy SQL Agenta. Catch-all mapování se smí měnit, jen když tu
--     není nic kromě RenoWorkshopu.
EXEC sp_MSforeachdb N'
USE [?];
SELECT DB_NAME() AS databaze,
       OBJECT_SCHEMA_NAME(referencing_id) + N''.'' + OBJECT_NAME(referencing_id) AS objekt
FROM sys.sql_expression_dependencies
WHERE referenced_server_name = N''RAS_HEN'';';

SELECT j.name AS uloha, s.step_name AS krok
FROM msdb.dbo.sysjobs AS j
JOIN msdb.dbo.sysjobsteps AS s ON s.job_id = j.job_id
WHERE s.command LIKE N'%RAS_HEN%';
GO


-- =====================================================================
-- ČÁST B - SQL Server Heliosu
-- =====================================================================

-- Spouštěj na serveru z dotazu A5b, ne na RENDCAPPu.

-- B1. Serverová práva vzdáleného účtu.
SELECT
    IS_SRVROLEMEMBER('sysadmin', N'renoworkshop') AS je_sysadmin,
    (SELECT COUNT(*) FROM sys.server_permissions AS sp
     JOIN sys.server_principals AS l ON l.principal_id = sp.grantee_principal_id
     WHERE l.name = N'renoworkshop' AND sp.permission_name = N'CONTROL SERVER'
       AND sp.state IN ('G', 'W')) AS ma_control_server;
GO

USE RNC_ostra;
GO

-- B2. Databázové role účtu v RNC_ostra.
SELECT r.name AS role
FROM sys.database_role_members AS m
JOIN sys.database_principals AS r ON r.principal_id = m.role_principal_id
JOIN sys.database_principals AS u ON u.principal_id = m.member_principal_id
WHERE u.sid = SUSER_SID(N'renoworkshop');

-- B3. Práva přidělená přímo účtu.
SELECT p.permission_name, p.state_desc, p.class_desc,
       OBJECT_SCHEMA_NAME(p.major_id) + N'.' + OBJECT_NAME(p.major_id) AS objekt
FROM sys.database_permissions AS p
JOIN sys.database_principals AS u ON u.principal_id = p.grantee_principal_id
WHERE u.sid = SUSER_SID(N'renoworkshop');

-- B4. Co účet v RNC_ostra SKUTEČNĚ smí (součet rolí i přímých práv).
--     Hledá se hlavně INSERT, UPDATE, DELETE, ALTER, EXECUTE, CONTROL.
--     EXECUTE AS jen dočasně přepne kontext, REVERT ho vrátí.
IF USER_ID(N'renoworkshop') IS NOT NULL
BEGIN
    EXECUTE AS USER = N'renoworkshop';
    SELECT permission_name AS muze_v_celé_databazi
    FROM fn_my_permissions(NULL, N'DATABASE');
    SELECT
        HAS_PERMS_BY_NAME(N'lcs.ino_srvszak_hlavicka', N'OBJECT', N'SELECT') AS cte_hlavicku,
        HAS_PERMS_BY_NAME(N'lcs.ino_srvszak_hlavicka', N'OBJECT', N'INSERT') AS zapisuje_hlavicku,
        HAS_PERMS_BY_NAME(N'lcs.ino_srvszak_hlavicka', N'OBJECT', N'UPDATE') AS meni_hlavicku,
        HAS_PERMS_BY_NAME(N'lcs.ino_srvszak_hlavicka', N'OBJECT', N'DELETE') AS maze_hlavicku;
    REVERT;
END
ELSE
    SELECT N'V RNC_ostra není uživatel renoworkshop - přístup nejspíš dává sysadmin (viz B1).' AS poznamka;
