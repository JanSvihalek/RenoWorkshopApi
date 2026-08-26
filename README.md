# RenoWorkshop API

Služba mezi mobilní aplikací [RenoWorkshop](https://github.com/JanSvihalek/RenoWorkshop)
a Heliosem. Běží na RENDCAPPu vedle RenoDesku.

Kontrakt rozhraní je v mobilní aplikaci v `docs/API.md` — ten je zdroj pravdy,
tahle služba ho plní.

Jak to celé běží, co na čem závisí a co se stane při výpadku:
[docs/PROVOZ.md](docs/PROVOZ.md).

## Co dělá

Aplikace **nikdy nemluví s Heliosem přímo**. Služba drží dvě oddělené věci:

| Data | Vlastník | Chování |
|---|---|---|
| zakázka, vozidlo, zákazník, útvar, termíny | Helios (jen čtení) | projekce, obnovuje se každých 5 minut, přepisuje se |
| dílenský stav, poznámky, stání | RenoWorkshop | vzniká v aplikaci, synchronizace na to nesahá |

Odděleně schválně: chyba v synchronizaci pak nemůže smazat práci mechaniků.
V nejhorším případě se přepíše kopie, kterou příští běh natáhne znovu.

## Rozjezd

```bash
npm install
cp .env.example .env       # vyplnit heslo k databázi - musí být dřív než build
npm run build              # součástí je i `prisma generate`
npx prisma migrate deploy  # založí tabulky ve vlastní databázi
npm run dev
```

`.env` musí existovat **před** buildem: `prisma generate` čte z něj připojení
a bez něj skončí chybou. Na serverech, kde npm blokuje instalační skripty,
se klient sám od sebe nevygeneruje - proto je generování součástí `build`.

Databáze je **SQL Server** - vlastní databáze a vlastní login, ideálně na téže
instanci, která má linkovaný server na Helios. Do produkčních databází ani do
Heliosu služba nezapisuje.

Na SQL Serveru je potřeba mít založené pohledy z
[`src/helios/dotazy.sql`](src/helios/dotazy.sql) a účet s právem `SELECT`
nad nimi. Nic víc — do Heliosu se nikdy nezapisuje.

## Struktura

| Cesta | Co je uvnitř |
|---|---|
| `src/domain/` | pravidla bez závislostí: útvary, pobočky, stavy zakázky |
| `src/helios/` | čtení z Heliosu a synchronizace do naší databáze |
| `src/routes/` | REST endpointy podle kontraktu aplikace |
| `src/auth.ts` | ověření Firebase ID tokenu |
| `prisma/schema.prisma` | schéma provozní databáze (SQL Server) |

Doménová vrstva je čistá a pokrytá testy (`npm test`) — právě v ní jsou
pravidla, která se nejspíš budou měnit.

## Útvary a pobočky

Helios vede u zakázky jen **útvar**, pětimístný kód typu `12211`
(`subjekty.reference_subjektu`). Pobočka se odvozuje **druhou číslicí**:

| Číslice | Pobočka |
|---|---|
| 1 | Brno |
| 2 | Čestlice |
| 3 | Kongresové Centrum |
| 4 | Česká |
| 5 | Bubeneč |

Odvození je tady na serveru schválně: kdyby přibyla pobočka nebo se pravidlo
změnilo, nemusí se kvůli tomu vydávat nová verze mobilní aplikace.

Názvy útvarů se zkracují — `RAS BSL AFS auta Servis` → `Auta Servis`. Pobočka
je v aplikaci vidět vedle, takže firma a kód lokality by jen zabíraly místo.

Kód, který se zařadit nedá (například `10005`, sdílené služby), dostane
`branch: null`; aplikace takovou zakázku ukáže jako „Bez pobočky" a nezahodí ji.

## Stavy

Dílenský stav (`received` … `picked_up`) je náš a Helios ho nezná. Helios vede
vlastní `stav_real`, který se používá dvakrát:

- **při prvním načtení** zakázky se z něj odvodí výchozí dílenský stav, aby
  seznam nezačínal se vším na „Přijato",
- **k odklizení**: `3 Ukončeno`, `50 Dokončeno` a `10 Nerealizuje se` znamenají,
  že vůz na dílně nestojí.

`36 K fakturaci` mezi nimi schválně není — vůz bývá hotový, ale pořád na
pozemku a poradce potřebuje vidět, že čeká na vyzvednutí.

Jakmile stav jednou posune mechanik, Helios do něj už nemluví.

## Stav prací

Hotové a ověřené testy:

- doménová pravidla (útvary, pobočky, stavy, posun stavu)

Napsané, ale zatím neověřené proti živým datům:

- čtení z Heliosu a synchronizace
- REST endpointy a ověření tokenu

Ještě chybí:

- založení databáze a nasazení (reverzní proxy přes IIS)
- mechanik u zakázky — v Heliosu se zatím nenašel sloupec
- úkony (závady) - zatím se z Heliosu netahají, aplikace dostane prázdný seznam
- fotodokumentace (viz kontrakt v aplikaci)
