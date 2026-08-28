# Jak to bude fungovat

Popis běhu služby pro toho, kdo ji nasazuje a pak provozuje. Nasazení dělá
Jan; tenhle dokument říká, co se kde děje a co od čeho závisí.

## Díly skládačky

```
  telefon (RenoWorkshop)
        │  HTTPS, Bearer token
        ▼
  IIS na RENDCAPP  ──reverzní proxy──►  Node služba :8092
                                            │        │
                            čte každých 5 min        │ čte a zapisuje
                                            ▼        ▼
                              pohledy nad Heliosem   databáze RenoWorkshop
                              (linkovaný server)     (SQL Server)
```

Tři věci musí běžet: **Node služba**, **reverzní proxy v IIS** a **pohledy
na SQL Serveru**. Helios sám o RenoWorkshopu neví a nic se do něj nezapisuje.

Pohledy nad Heliosem leží **v téže databázi** jako naše tabulky a do DMS
sahají přes **linkovaný server**. Služba tak vystačí s jedním připojením
a jedním loginem. Že se do Heliosu jen čte, hlídá mapování linkovaného
serveru - vzdálený účet má práva pouze `SELECT`.

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
| `helios_zakazky` | Helios | přepisuje obsah, ale **nic nemaže** |
| `dilenske_stavy`, `poznamky` | RenoWorkshop | **nesahá na ně** |

Úkony (závady) se z Heliosu zatím netahají - aplikace dostane prázdný
seznam a sekci nezobrazí. Až se to bude rozšiřovat, přibude druhý pohled.

**Typ zakázky** je v Heliosu *řada zakázky*. Pohled vrací jen její číslo
(`801`, `802`, ...) do sloupce `rada_reference`; názvy k nim drží **naše**
tabulka `typy_zakazek` (`rada_reference` → `rada_zakazek`):

| Kde | Co je tam | Kdo to mění |
|---|---|---|
| Helios | číslo řady | servisní poradce při založení zakázky |
| `typy_zakazek` | název pro appku (`Běžná`, `PDI`) | ty, `UPDATE` v SSMS |
| `helios_zakazky.rada_reference` | číslo u konkrétní zakázky | synchronizace |

Rozdělené je to proto, že číslo je stabilní klíč, kdežto název se dá
v Heliosu přepsat - a filtr zapnutý v telefonu by pak přestal sedět.
Úprava názvu se navíc projeví **hned**, bez nasazování a bez nové verze
aplikace; API si tabulku přečte při každém požadavku.

Pohled pouští jen řady **8xx** - číselník v Heliosu obsahuje i řady, které
se servisu netýkají, a některé mají tak dlouhou referenci, že se do sloupce
nevejdou (na tom první synchronizace spadla). Zakázka s jinou řadou se
nezahazuje, jen zůstane bez typu.

Řada, která v tabulce chybí, se v appce ukáže jako holé číslo - je pak
vidět, že přibyla. Zakázka kvůli tomu nikdy nezmizí a synchronizace
nespadne (proto tam není cizí klíč). Dohledání chybějících je na konci
[`docs/sql/tabulky.sql`](sql/tabulky.sql).

Kdyby se synchronizace pokazila, v nejhorším případě přepíše kopie, které
příští běh natáhne znovu. Práci mechaniků zničit nemůže.

## Synchronizace

Časovač v Node službě, výchozí interval **300 vteřin** (`SYNC_INTERVAL_SECONDS`).
Jeden běh vypadá takhle:

1. Zapíše řádek do `synchronizace` (začátek běhu).
2. Přečte pohled `v_renoworkshop_zakazky`. Dotaz trvá kolem 1,5 vteřiny.
3. Zahodí zakázky ve stavu `3 Ukončeno`, `50 Dokončeno`, `10 Nerealizuje se`.
   Filtruje se tady i v pohledu. Když pohled ukončené pustí (dnes ano,
   podmínka je jen `stav_real <> 10`), přenese se přes linkovaný server
   kolem 70 000 řádků při každém běhu místo zhruba 1 500 - v databázi se
   nic nezkazí, ale je to zbytečná zátěž. Viz poznámku v `dotazy.sql`.
4. Zbytek zapíše do `helios_*`. Zakázku, kterou vidí poprvé, založí a nastaví
   jí **výchozí dílenský stav odvozený z Heliosu** (`42 Nenaskladněno` → čeká
   na díly, `30 Zpracováváno` → v opravě, `36 K fakturaci` → připraveno).
   U už známé zakázky se dílenského stavu nedotkne.
5. Zakázky, které Helios v tomhle běhu nevrátil mezi aktivními, **označí
   jako uzavřené** (`je_aktivni = 0`). Nemaže je — k poznámkám a
   fotodokumentaci se lidé vracejí i po roce a Helios je nezná, takže by
   je nikdo neobnovil. Zakázka se může i vrátit na dílnu (reklamace),
   pak se příznak zase přepne.
6. Doplní do `synchronizace` konec běhu a počet zakázek, nebo chybu.

**Výpadek Heliosu službu neshodí.** Chyba se zapíše, aplikace dál ukazuje
poslední známý stav — což je pro dílnu lepší než prázdná obrazovka.

Kromě časovače jde synchronizaci vyvolat ručně přes `POST /api/sync`
(použije se, když poradce právě založil zakázku a mechanik na ni čeká).
Je omezená na **jedno volání za minutu pro celou dílnu**, další dostane `429`.

## Co se děje při práci v aplikaci

**Otevření seznamu** — `GET /api/orders` vrací **jen rozdělané zakázky za
poslední tři měsíce** (`SEZNAM_MESICU`). Uzavřených jsou desítky tisíc a
aplikace si seznam drží v paměti, aby filtrovala a hledala bez čekání —
proto se do telefonu neposílají. Čte se jen z naší databáze, do Heliosu
se přitom nesahá. Data mohou být až pět minut stará.

**Dohledání staré zakázky** — `GET /api/orders/search?q=...` prohledá
**celý archiv** včetně uzavřených, podle čísla zakázky, VIN, SPZ nebo
zákazníka. Hledá se na serveru, takže na velikosti archivu nezáleží;
přenáší se jen nalezené (nejvýš `HLEDANI_LIMIT`). Typický případ je
dohledání fotodokumentace k roční zakázce.

**Posun stavu** — `PATCH /api/orders/{id}`. Služba ověří, že jde o posun
o jeden krok dopředu (aplikace jiný nenabízí, ale spoléhat se na to nedá),
zapíše ho do `dilenske_stavy` spolu s tím, kdo ho udělal, a vrátí celou
aktualizovanou zakázku. **Do Heliosu nejde nic.**

**Poznámka** — `POST /api/orders/{id}/notes`. Autor se bere z tokenu, ne
z těla požadavku.

Filtrování, hledání a řazení dělá aplikace u sebe nad načteným seznamem,
takže se při každém ťuknutí nechodí na server.

## Co se stane, když něco selže

| Situace | Co uvidí mechanik | Co s tím |
|---|---|---|
| Helios nebo linkovaný server neodpovídá | data se přestanou obnovovat, poslední stav zůstane | `GET /health` ukáže chybu posledního běhu |
| databáze RenoWorkshop nedostupná | „Server hlásí chybu. Zkuste to za chvíli." | zkontrolovat SQL Server a login |
| vypršelý token | „Přihlášení vypršelo." a návrat na přihlášení | přihlásit se znovu |
| telefon bez signálu | „Server neodpovídá." po 15 vteřinách | zatím se posun stavu ztratí, offline fronta není |
| zakázka uzavřena v Heliosu | zmizí ze seznamu po nejbližší synchronizaci | tak to má být |

`GET /health` je schválně bez přihlášení, aby šlo zvenčí poznat, že služba
žije, aniž by se kvůli tomu vydával token. Vrací čas poslední synchronizace
a její případnou chybu — je to nejrychlejší způsob, jak zjistit, jestli je
problém v appce, nebo v datech.

## Co je potřeba nastavit

1. **Databáze** — na SQL Serveru založit databázi (třeba `RenoWorkshop`)
   a login, který má práva **jen v ní**. Připojení patří do `DATABASE_URL`.
2. **Tabulky** — buď `npx prisma migrate deploy`, nebo skript
   [`docs/sql/tabulky.sql`](sql/tabulky.sql) v SSMS. Výsledek je stejný.
3. **Linkovaný server** `RAS_HEN` na RENDCAPPu, mířící na Helios. Mapování
   přihlášení má používat vzdálený účet s právem **jen `SELECT`**, a to jen
   pro login služby - ostatní ať mají „Not be made", aby přes ten most
   nemohl skočit kdokoli.
4. **Pohled** — skript `src/helios/dotazy.sql`, spustit v databázi
   `RenoWorkshop`. Je v něm i varianta přes `OPENQUERY` pro případ, že by
   byl distribuovaný dotaz pomalý.
5. **Firebase service account** do `secrets/` a cesta v `.env`.
6. **Node služba** — `.env` vyplnit, pak `npm ci && npm run build && npm start`.
   Pořadí není libovolné: `build` spouští `prisma generate`, který potřebuje
   `DATABASE_URL` z `.env`. Konfigurace se načte ze souboru `.env` ve složce
   projektu, nebo z proměnných prostředí, když ho správce služby nastaví sám.
   Musí se spouštět po startu serveru; jak, je na tobě (Windows služba přes
   nssm, nebo kontejner — podle toho, jak běží RenoDesk).
7. **Certifikát** pro jméno, na kterém API poběží - viz
   [CERTIFIKAT.md](CERTIFIKAT.md). Bez důvěryhodného certifikátu se
   mobilní aplikace nepřipojí; nedá se to v ní obejít.
8. **Reverzní proxy v IIS** z veřejné cesty na `http://localhost:8092`.
   Na RENDCAPPu běží cizí produkční aplikace, takže **žádný `iisreset`** —
   jen restart konkrétního webu.

## Ověření bez mobilu

Než je hotový certifikát a než se dá appka nainstalovat do telefonu, jde celý
řetěz ověřit přímo na serveru. API vyžaduje Firebase token, takže se jeden
vyrobí nástrojem v `tools/`:

```powershell
cd C:\RenoWorkshopApi
$t = node tools/testovaci-token.mjs
Invoke-RestMethod http://localhost:8092/api/orders -Headers @{ Authorization = "Bearer $t" } |
  Select-Object -First 3 id, licensePlate, model, status |
  Format-Table -AutoSize
```

Když se vypíšou skutečné zakázky, funguje celá cesta: Helios → linkovaný
server → naše databáze → API → ověření tokenu. Zbývá pak už jen certifikát
a doprava do telefonu.

Token platí hodinu a má práva přihlášeného zaměstnance - po ověření zavři
okno, zůstává v historii PowerShellu. Ve Firebase Authentication po něm
zůstane uživatel `diagnostika-api`, který se dá smazat.

## Než se aplikace přepne na ostrá data

Aplikace zatím běží na ukázkových datech. Přepne se proměnnou při buildu:

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://<adresa>/renoworkshop/api/
```

Adresa musí končit lomítkem. Po přepnutí ukazuje obrazovka Nastavení
u řádku „Zdroj dat" hodnotu **Servisní systém** místo **Ukázková data** —
podle toho se pozná, co má tester v telefonu.

## Otevřené: login služby má sysadmin

Login `renoworkshop` má na RENDCAPPu roli **`sysadmin`**. Je to víc, než
služba potřebuje - stačilo by jí `db_datareader` a `db_datawriter`
v databázi RenoWorkshop.

Zúžení se **zkoušelo a nepovedlo** (srpen 2026): bez `sysadmin` začne
synchronizace padat na

```
Code: 7416  Access to the remote server is denied because no login-mapping exists.
```

Přitom mapování na linkovaném serveru `RAS_HEN` vypadá správně - je tam
catch-all pro všechny loginy se vzdáleným účtem `renoworkshop`
a `uses_self_credential = 0`. Zdá se tedy, že se catch-all na běžné
(nesysadmin) loginy neuplatňuje tak, jak vypadá.

Nevyzkoušený krok, kterým to nejspíš půjde dorazit - **jmenovité** mapování
místo catch-all, pod adminem:

```sql
EXEC sp_addlinkedsrvlogin
    @rmtsrvname  = N'RAS_HEN',
    @useself     = N'FALSE',
    @locallogin  = N'renoworkshop',
    @rmtuser     = N'renoworkshop',
    @rmtpassword = N'<heslo účtu na Heliosu>';
```

Potřeba je k tomu heslo účtu `renoworkshop` na straně Heliosu. Ověřuje se
tak, že se pod tím loginem pustí

```sql
SELECT TOP 5 reference_subjektu FROM RAS_HEN.RNC_ostra.lcs.ino_srvszak_hlavicka;
```

Pozor: pod adminem projde vždycky, takže testovat **jen** pod loginem
`renoworkshop`. A systémové pohledy (`sys.servers`, `sys.linked_logins`)
nesysadmin login nevidí - vracejí prázdno místo chyby, což mate.

Dokud tohle platí, **nepublikovat službu ven** (viz níž): případný průlom
do procesu by dal k dispozici všemocný databázový účet a přes linkovaný
server cestu k Heliosu. Ve vnitřní síti je to únosné.

## Odkud telefony na server dosáhnou

**Rozhodnuto (srpen 2026): jen z firemní sítě.** Aplikace funguje na firemní
wi-fi a nikde jinde. Devět z deseti případů je mechanik u auta v hale, takže
to pokrývá skutečný provoz a nestojí to nic - žádná díra ve firewallu,
žádná správa VPN na telefonech.

Certifikát na tomhle nic nemění. Ověřuje se přes DNS, takže se Let's Encrypt
na RENDCAPP nikdy nepřipojuje; certifikát potvrzuje jméno serveru, ne jeho
dostupnost zvenčí.

Kdyby se ukázalo, že lidé zakázky potřebují i mimo dílnu, jsou tři cesty:

| Cesta | Co obnáší |
|---|---|
| VPN na firemních telefonech | API zůstane vevnitř; nastavení na každém telefonu |
| proxy v DMZ | ven jde oddělený stroj, ten sahá dovnitř; další server ke správě |
| publikovat RENDCAPP ven | nejrychlejší, ale vystaví produkční server s cizími aplikacemi |

Tu třetí nedoporučuju: na RENDCAPPu běží cizí produkční aplikace a případný
průšvih by nebyl jen náš.

Dvě věci, které by se u kterékoli z nich musely dořešit:

- **DNS** - `A` záznam je zatím jen na vnitřním DNS. Pro provoz zvenčí by
  musel být i veřejně ve WEDOSu.
- **Port** - zevnitř stačí 8444, zvenčí bych šel na 443. Cizí a hotelové
  sítě nestandardní porty blokují a projeví se to jako „appka občas
  nefunguje", což se špatně hledá.
