# Jak to bude fungovat

Popis běhu služby pro toho, kdo ji nasazuje a pak provozuje. Nasazení dělá
Jan; tenhle dokument říká, co se kde děje a co od čeho závisí.

## Díly skládačky

```
  telefon (RenoWorkshop)
        │  HTTPS, Bearer token
        ▼
  IIS na RENDCAPP  ──reverzní proxy──►  Node služba :8081
                                            │        │
                            čte každých 5 min        │ čte a zapisuje
                                            ▼        ▼
                                   SQL Server     Postgres :5433
                                   (linkovaný      (Docker)
                                    server → Helios)
```

Čtyři věci musí běžet: **Postgres v Dockeru**, **Node služba**, **reverzní
proxy v IIS** a **pohledy na SQL Serveru**. Helios sám o RenoWorkshopu neví
a nic se do něj nezapisuje.

## Přihlášení

1. Mechanik v aplikaci zvolí přihlášení Microsoftem. Otevře se firemní
   přihlašovací dialog Entra ID (tenant RENOCAR), appka do něj nevidí.
2. Po úspěchu vydá Firebase **ID token** platný hodinu; aplikace si ho sama
   obnovuje, dokud se uživatel neodhlásí.
3. Každý požadavek na API nese `Authorization: Bearer <token>`.
4. Služba token ověří knihovnou `firebase-admin` proti projektu
   `renoworkshop`. Ověřuje se **na serveru** — tomu, co tvrdí telefon, se
   nevěří. Neplatný nebo vypršelý token vrací `401` a aplikace pošle
   uživatele na přihlášení.

K ověření potřebuje služba **service account klíč** Firebase (JSON) v cestě
z `GOOGLE_APPLICATION_CREDENTIALS`. Ten se do gitu nedává.

## Odkud jsou data

Služba má vlastní databázi a v ní dvě oddělené skupiny tabulek:

| Tabulky | Kdo je vlastní | Co s nimi dělá synchronizace |
|---|---|---|
| `helios_zakazky`, `helios_ukony` | Helios | přepisuje je, jsou to kopie |
| `dilenske_stavy`, `poznamky` | RenoWorkshop | **nesahá na ně** |

Sloupec `helios_ukony.hotovo` je výjimka: řádek úkonu je z Heliosu, ale
příznak hotovo je náš a synchronizace ho nepřepisuje.

Kdyby se synchronizace pokazila, v nejhorším případě přepíše kopie, které
příští běh natáhne znovu. Práci mechaniků zničit nemůže.

## Synchronizace

Časovač v Node službě, výchozí interval **300 vteřin** (`SYNC_INTERVAL_SECONDS`).
Jeden běh vypadá takhle:

1. Zapíše řádek do `synchronizace` (začátek běhu).
2. Přečte dva pohledy ze SQL Serveru: `v_renoworkshop_zakazky`
   a `v_renoworkshop_ukony`. Dotaz trvá kolem 1,5 vteřiny.
3. Zahodí zakázky ve stavu `3 Ukončeno`, `50 Dokončeno`, `10 Nerealizuje se`.
4. Zbytek zapíše do `helios_*`. Zakázku, kterou vidí poprvé, založí a nastaví
   jí **výchozí dílenský stav odvozený z Heliosu** (`42 Nenaskladněno` → čeká
   na díly, `30 Zpracováváno` → v opravě, `36 K fakturaci` → připraveno).
   U už známé zakázky se dílenského stavu nedotkne.
5. Smaže zakázky, které Helios v tomhle běhu nevrátil — jsou uzavřené nebo
   zrušené. Mizí i s poznámkami a dílenským stavem; historii vede Helios.
6. Doplní do `synchronizace` konec běhu a počet zakázek, nebo chybu.

**Výpadek Heliosu službu neshodí.** Chyba se zapíše, aplikace dál ukazuje
poslední známý stav — což je pro dílnu lepší než prázdná obrazovka.

Kromě časovače jde synchronizaci vyvolat ručně přes `POST /api/sync`
(použije se, když poradce právě založil zakázku a mechanik na ni čeká).
Je omezená na **jedno volání za minutu pro celou dílnu**, další dostane `429`.

## Co se děje při práci v aplikaci

**Otevření seznamu** — `GET /api/orders` čte jen z Postgresu, do Heliosu
nesahá. Odpověď je jeden dotaz do lokální databáze, takže je rychlá i na
dílenské wi-fi. Data mohou být až pět minut stará.

**Posun stavu** — `PATCH /api/orders/{id}`. Služba ověří, že jde o posun
o jeden krok dopředu (aplikace jiný nenabízí, ale spoléhat se na to nedá),
zapíše ho do `dilenske_stavy` spolu s tím, kdo ho udělal, a vrátí celou
aktualizovanou zakázku. **Do Heliosu nejde nic.**

**Poznámka** — `POST /api/orders/{id}/notes`. Autor se bere z tokenu, ne
z těla požadavku.

**Hotový úkon** — `PATCH /api/orders/{id}/work-items/{ukonId}` přepne
příznak `hotovo`.

Filtrování, hledání a řazení dělá aplikace u sebe nad načteným seznamem,
takže se při každém ťuknutí nechodí na server.

## Co se stane, když něco selže

| Situace | Co uvidí mechanik | Co s tím |
|---|---|---|
| Helios nebo linkovaný server neodpovídá | data se přestanou obnovovat, poslední stav zůstane | `GET /health` ukáže chybu posledního běhu |
| Postgres neběží | „Server hlásí chybu. Zkuste to za chvíli." | nastartovat kontejner |
| vypršelý token | „Přihlášení vypršelo." a návrat na přihlášení | přihlásit se znovu |
| telefon bez signálu | „Server neodpovídá." po 15 vteřinách | zatím se posun stavu ztratí, offline fronta není |
| zakázka uzavřena v Heliosu | zmizí ze seznamu po nejbližší synchronizaci | tak to má být |

`GET /health` je schválně bez přihlášení, aby šlo zvenčí poznat, že služba
žije, aniž by se kvůli tomu vydával token. Vrací čas poslední synchronizace
a její případnou chybu — je to nejrychlejší způsob, jak zjistit, jestli je
problém v appce, nebo v datech.

## Co je potřeba nastavit

1. **Postgres** — `docker compose up -d`, port 5433 (schválně jiný než 5432,
   ať se nepere s Postgresem RenoDesku), heslo v `.env`.
2. **Tabulky** — `npx prisma migrate deploy`.
3. **Pohledy na SQL Serveru** — skript `src/helios/dotazy.sql`. Pozor,
   server je starší než 2016 SP1, takže `create or alter view` neprojde;
   skript to řeší přes drop + create a musí se pouštět v normálním query
   okně, ne v grafickém návrháři.
4. **Účet do SQL Serveru** s právem **jen `SELECT`** nad těmi dvěma pohledy.
   Víc práv služba nepotřebuje a mít je by bylo zbytečné riziko.
5. **Firebase service account** do `secrets/` a cesta v `.env`.
6. **Node služba** — `npm ci && npm run build && node dist/server.js`.
   Musí se spouštět po startu serveru; jak, je na tobě (Windows služba přes
   nssm, nebo kontejner — podle toho, jak běží RenoDesk).
7. **Reverzní proxy v IIS** z veřejné cesty na `http://localhost:8081`.
   Na RENDCAPPu běží cizí produkční aplikace, takže **žádný `iisreset`** —
   jen restart konkrétního webu.

## Než se aplikace přepne na ostrá data

Aplikace zatím běží na ukázkových datech. Přepne se proměnnou při buildu:

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://<adresa>/renoworkshop/api/
```

Adresa musí končit lomítkem. Po přepnutí ukazuje obrazovka Nastavení
u řádku „Zdroj dat" hodnotu **Servisní systém** místo **Ukázková data** —
podle toho se pozná, co má tester v telefonu.

## Otevřená otázka: odkud budou telefony na server dosáhnout

Tohle je potřeba rozhodnout dřív, než se appka přepne. Když bude API jen ve
vnitřní síti, funguje na firemní wi-fi a nikde jinde — což pro dílnu možná
stačí, ale znamená to, že mimo budovu aplikace neukáže nic. Varianty jsou
vnitřní síť, VPN na firemních telefonech, nebo publikování ven přes IIS
s omezením. Každá má jiné nároky na certifikát a na bezpečnost.
