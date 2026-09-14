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
a jedním loginem. Že se do Heliosu jen čte, hlídá **zatím jen kód**
služby. Záměr je, aby to hlídala i práva vzdáleného účtu na Heliosu - to ale
není ověřené, viz *Otevřené: práva účtu linkovaného serveru na Heliosu*.

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

## Zodpovědná osoba

Kdo za zakázku zodpovídá, vede Helios (`hlv.zodpovida` → `subjekty`).
Pohled vrací kód i jméno; do našich tabulek jdou oba, do API se posílá
jméno jako `mechanicName` a kód jako `mechanicCode`.

Sloupce se zakládají skriptem [`docs/sql/zodpovida.sql`](sql/zodpovida.sql).
Aplikace to pole nikdy nemění - je to údaj z ERP.

## Odkud jsou data

Služba má vlastní databázi a v ní dvě oddělené skupiny tabulek:

| Tabulky | Kdo je vlastní | Co s nimi dělá synchronizace |
|---|---|---|
| `helios_zakazky` | Helios | přepisuje obsah, ale **nic nemaže** |
| `dilenske_zaznamy`, `poznamky` | RenoWorkshop | **nesahá na ně** |

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

## Dílenské stavy

Zakázka má dva nezávislé stavy:

| | Odkud | Kdo mění |
|---|---|---|
| **Stav z Heliosu** | `stav_real` z ERP | Helios, jen ke čtení |
| **Dílenský stav** | naše databáze | lidé v aplikaci |

Dílenský stav se **přidává, neposouvá**. Oprava po bouračce běží týdny,
stavy se vracejí i přeskakují (pojišťovna vrátí rozpočet, díl dorazí
poškozený), takže žádné pravidlo o krocích dopředu neplatí. V tabulce
`dilenske_zaznamy` je celá historie a **poslední záznam je ten platný** -
je tak vidět, kdy se co stalo a jak dlouho se na co čekalo.

Zakázka, které stav nikdo nedal, žádný nemá. Z Heliosu se neodvozuje:
tvrdit za dílnu „Přijato" by znamenalo ukazovat něco, co nikdo nepotvrdil.

### Číselník

Co jde vybrat z nabídky, drží `dilenske_stavy_ciselnik`. Spravuje se ručně
v databázi a aplikace si ho stahuje, takže přidání stavu **nevyžaduje novou
verzi v telefonech**:

```sql
INSERT INTO dbo.dilenske_stavy_ciselnik (kod, nazev, poradi)
VALUES (N'geometrie', N'Geometrie', 125);
```

Založí se skriptem [`docs/sql/dilenske-stavy.sql`](sql/dilenske-stavy.sql),
který se pouští celý a dá se spustit opakovaně.

Přejmenování stavu nemění historii - v záznamu je uložený text z doby
zápisu. Vyřazení ze seznamu se dělá `je_aktivni = 0`, ne mazáním; smazaný
kód by osiřel v záznamech, které na něj odkazují.

Kdo potřebuje stav mimo nabídku, zapíše v aplikaci vlastní text. Takový
záznam nemá kód, jinak se chová stejně.

Ke stavu se dá připsat **poznámka** - kde vůz stojí, na kterém je zvedáku,
na co se čeká. Drží se u konkrétního záznamu, takže je vidět v historii
u toho kroku, ke kterému patří.

Omylem přidaný stav jde v aplikaci smazat. Je to pracovní přehled dílny,
ne auditní doklad, takže nemá cenu vláčet historií překlep; opravou je
smazat a přidat znovu. Mazat smí kdokoli přihlášený - u telefonu na dílně
se lidé střídají.

## Synchronizace

Časovač v Node službě, výchozí interval **300 vteřin** (`SYNC_INTERVAL_SECONDS`).
Jeden běh vypadá takhle:

1. Zapíše řádek do `synchronizace` (začátek běhu).
2. Přečte pohled `v_renoworkshop_zakazky` - jen rozdělané zakázky, bez
   desítek tisíc ukončených.
3. Pro jistotu zahodí zakázky ve stavu `3 Ukončeno` a `10 Nerealizuje se`,
   kdyby je pohled někdy pustil. `50 Dokončeno` mezi ukončené nepatří -
   pro dílnu to neznamená, že je zakázka kompletně hotová. Ukončené zakázky
   tahá zvlášť noční historie (viz níže).
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
7. Doplní vozidla, zákazníky, modely a kontakty, na které zakázky ukazují
   a v zrcadlech ještě nejsou (viz níže). Když to selže, zakázky už jsou
   uložené a doplnění se zkusí příští běh.

**Výpadek Heliosu službu neshodí.** Chyba se zapíše, aplikace dál ukazuje
poslední známý stav — což je pro dílnu lepší než prázdná obrazovka.

Kromě časovače jde synchronizaci vyvolat ručně přes `POST /api/sync`
(použije se, když poradce právě založil zakázku a mechanik na ni čeká).
Je omezená na **jedno volání za minutu pro celou dílnu**, další dostane `429`.

### Vozidla, zákazníci, modely a kontakty

Kvůli vyhledávání podle SPZ drží služba kopie čtyř tabulek z Heliosu:
`helios_vozidla`, `helios_organizace`, `helios_modely`, `helios_kontakty`.
V září 2026 to bylo 51 360 vozidel, 61 201 organizací, 5 526 modelů
a 73 078 kontaktů.

Plní se dvěma cestami:

- **Plný běh jednou za noc** (`ZRCADLA_HODINA`, výchozí 3:00) opíše všechna
  čtyři zrcadla celá. Tím se propíší změny — nový telefon, přeznačené auto.
- **Doplnění po každé synchronizaci zakázek** dotáhne jen to, co chybí.
  Nový zákazník se tak objeví do pěti minut, ne až ráno. Většinu běhů
  nenajde nic a Heliosu se nedotkne.

Zapisuje se dávkově přes `MERGE` (`src/helios/davka.ts`), ne po řádcích —
po jednom by zápis 190 000 řádků trval řádově déle než čtení z Heliosu.
Ze zrcadel se nikdy nic nemaže.

### Historie zakázek

Ukončené zakázky (`3 Ukončeno`) čte zvlášť pohled
`v_renoworkshop_zakazky_historie`, desítky tisíc řádků.
`50 Dokončeno` mezi ně nepatří a zůstává v seznamu na dílně. Kvůli vyhledávání:
k vozidlu se mají ukázat všechny jeho zakázky napříč lety, ne jen ty,
které jsme stihli zachytit rozdělané.

Běží v noci hned po vozidlech a zákaznících, zapisuje se do stejné tabulky
`helios_zakazky` a stejně dávkově. Oba běhy si práci dělí:

| | Pětiminutový | Noční historie |
|---|---|---|
| Které zakázky | rozdělané | ukončené |
| `je_aktivni`, `uzavrena_at` | **jen on** přepíná | u existující zakázky nesahá |
| Nová zakázka | aktivní | rovnou neaktivní |

Kdyby noční běh přepínal aktivitu, mohl by schovat zakázku, která se
mezitím vrátila na dílnu (reklamace), nebo přepsat skutečné datum uzavření.

Doplňování vozidel a zákazníků po pětiminutovém běhu se historie netýká -
běží jen pro rozdělané zakázky. Část starých zakázek ukazuje na vozidla,
která už v Heliosu nejsou, a doptávalo by se na ně pořád dokola.

Text delší než sloupec se při dávkovém zápisu zkrátí, místo aby shodil
celou dávku.

Zavedení (jednou):

1. `docs/sql/pohled-historie.sql`
2. `npm run build`, `npm run historie`
3. `docs/sql/pohled-zakazky-jen-rozdelane.sql` - až potom, ať ukončené
   zakázky nechybí ani chvíli

První naplnění na RENDCAPPu (14. 9. 2026): **70 626 zakázek za 228 vteřin**.
Celý noční běh (zrcadla + historie) tedy trvá kolem devíti minut.

### Závady

Závady (úkony) na zakázkách čte pohled `v_renoworkshop_zavady` do zrcadla
`helios_zavady`. K zakázce se vážou přes `cislo_subjektu` hlavičky
(`helios_zakazky.zakazka_id`), ne přes číslo zakázky - to se v Heliosu
výjimečně opakuje.

- **Každých pět minut** po zakázkách: závady **rozdělaných** zakázek. Co
  u nich Helios přestal vracet, se **smaže** - dílna nemá opravovat, co už
  na zakázce není. Selhání neshodí zápis zakázek.
- **V noci** po historii: závady všech zakázek, kvůli starým zakázkám na
  kartě vozidla. Nic nemaže. Ručně: `npm run zavady`.

Aplikace je ukazuje v detailu zakázky jen ke čtení (`defects` v API).

Zavedení: `docs/sql/zavady.sql`, pohled závad a `hlv.cislo_subjektu`
v obou zakázkových pohledech, pak nasadit službu.

**První naplnění** po založení tabulek:

```
npm run build
npm run zrcadla
```

Vypíše počty a dobu běhu. Jde pustit kdykoli znovu a běžící služba mu nevadí.

První naplnění na RENDCAPPu (září 2026) trvalo **300 vteřin**. Většina času
je zápis, čtení z Heliosu je v řádu vteřin. Kdyby se noční běh začal
výrazně prodlužovat, je to první číslo, se kterým ho porovnat.

## Co se děje při práci v aplikaci

**Otevření seznamu** — `GET /api/orders` vrací **všechny rozdělané
zakázky**, bez ohledu na stáří. Časové okno tu dřív bylo, ale na klempírně
je to chyba: oprava po bouračce běží i půl roku a vůz mezitím stojí v hale.
Uzavřených jsou desítky tisíc a do telefonu se neposílají — aplikace si
seznam drží v paměti, aby filtrovala a hledala bez čekání; dohledají se
přes hledání. Čte se jen z naší databáze, do Heliosu se přitom nesahá.
Data mohou být až pět minut stará.

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

## Otevřené: stejné číslo u dvou zakázek

Pohled historie vrátil 7 zakázek dvakrát (září 2026), např. `Z1212400023`,
`Z2212400634`, `Z4212501175`. Všechny joiny v pohledu jdou přes
`cislo_subjektu`, takže nejpravděpodobnější je, že v Heliosu existují
**dvě různé zakázky se stejným `reference_subjektu`** - třeba v různých
pořadačích.

Dnešní dopad je malý: jde jen o staré ukončené zakázky a dávkový zápis
duplicity před zápisem sloučí, takže kvůli nim noční běh nespadne.
U rozdělaných zakázek duplicity nejsou.

Kdyby se to ale stalo u rozdělané zakázky, dvě auta by se v aplikaci
slila do jedné karty a dílenské stavy i poznámky by se míchaly - klíčem
zakázky je u nás právě `reference_subjektu`. Ověřit (jen čte):

```sql
SELECT hlv.reference_subjektu, hlv.cislo_subjektu, hlv.cislo_poradace,
       hlv.stav_real, hlv.datum_prijeti, hlv.spz
FROM   RAS_HEN.RNC_ostra.lcs.ino_srvszak_hlavicka AS hlv
WHERE  hlv.reference_subjektu IN (N'Z1212400023', N'Z2212400634', N'Z4212501175')
ORDER  BY hlv.reference_subjektu, hlv.cislo_subjektu;
```

Různé `cislo_subjektu` u stejného čísla = opravdu dvě zakázky, a pak by
se klíč zakázky měl změnit na `cislo_subjektu`. Stejné `cislo_subjektu`
dvakrát = chyba v joinu pohledu.

## Otevřené: práva účtu linkovaného serveru na Heliosu

Linkovaný server `RAS_HEN` se do Heliosu hlásí vzdáleným účtem
`renoworkshop`. **Jaká práva ten účet na Heliosu má, nikdo neověřil.**

Služba do Heliosu nezapisuje - zápisy jdou jen do tabulek v databázi
RenoWorkshop a do Heliosu vede jen `select` z pohledů. To ale hlídá kód.
Kdyby měl vzdálený účet víc než čtení, chyba v kódu nebo průnik do služby
by mohly v Heliosu zapisovat a nic by je nezastavilo.

Cílový stav - účet smí **číst jen tabulky, které pohledy používají**, nic
víc. Ani `db_datareader`, ten by otevřel celou databázi Heliosu:

```sql
-- Na serveru Heliosu, v RNC_ostra
GRANT SELECT ON lcs.ino_srvszak_hlavicka     TO renoworkshop;
GRANT SELECT ON lcs.ino_srvszak_zakazka      TO renoworkshop;
GRANT SELECT ON lcs.attribute_valuation_entry TO renoworkshop;
GRANT SELECT ON lcs.subjekty                 TO renoworkshop;
GRANT SELECT ON lcs.organizace               TO renoworkshop;
GRANT SELECT ON lcs.kontaktni_osoby          TO renoworkshop;
GRANT SELECT ON lcs.ino_vozidlo              TO renoworkshop;
GRANT SELECT ON lcs.ino_znackamodel          TO renoworkshop;
```

a nesmí být v žádné roli, která dává zápis (`db_datawriter`, `db_owner`,
serverová `sysadmin`). Až se k pohledům přidá tabulka, přibude sem i grant.

Jak zjistit současný stav (na serveru Heliosu, jen čte metadata):

```sql
SELECT IS_SRVROLEMEMBER('sysadmin', N'renoworkshop') AS je_sysadmin;

USE RNC_ostra;
SELECT r.name AS role
FROM sys.database_role_members m
JOIN sys.database_principals r ON r.principal_id = m.role_principal_id
JOIN sys.database_principals u ON u.principal_id = m.member_principal_id
WHERE u.name = N'renoworkshop';

SELECT permission_name, state_desc, OBJECT_NAME(major_id) AS objekt
FROM sys.database_permissions
WHERE grantee_principal_id = USER_ID(N'renoworkshop');
```

Souvisí to s *login služby má sysadmin* výš: jmenovité mapování
`sp_addlinkedsrvlogin` se zadává heslem téhož účtu. Nejrozumnější je obojí
udělat naráz - zúžit práva na Heliosu, založit jmenovité mapování a pak
odebrat `sysadmin` na RENDCAPPu.

**Pozor na ostatní uživatele `RAS_HEN`.** Linkovaný server může používat
i něco jiného než RenoWorkshop. Měnit jen mapování pro login `renoworkshop`,
catch-all nechat, dokud není jasné, kdo další přes něj chodí.

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
