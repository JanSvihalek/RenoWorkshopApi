# Certifikát: vydání a obnova

Služba běží za IIS na HTTPS a mobilní aplikace **nepřijme nedůvěryhodný
certifikát** — na rozdíl od prohlížeče nejde nic odkliknout. Když certifikát
vyprší, appka ze dne na den přestane fungovat všem.

Certifikát je od **Let's Encrypt**, platí **90 dní** a obnovuje se **ručně**,
protože ověření vlastnictví domény vyžaduje zápis do DNS ve WEDOS a k tomu
nemá služba přístup.

## Proč DNS ověření a ne to obvyklé

Let's Encrypt umí ověřit vlastnictví domény dvěma způsoby:

- **HTTP-01** — Let's Encrypt se připojí na `http://renoworkshop.renocar.cz`
  z internetu. To by znamenalo vystavit RENDCAPP ven, což nechceme.
- **DNS-01** — do DNS se vloží ověřovací TXT záznam. Let's Encrypt si ho
  přečte a na server **se vůbec nepřipojuje**.

Používáme DNS-01. Server proto nemusí být z internetu dostupný a `A` záznam
pro `renoworkshop.renocar.cz` může klidně být jen na vnitřním DNS - stačí,
aby ho uměly přeložit firemní telefony. Ve WEDOS je potřeba **jen ten TXT
záznam**.

## První vydání

Jednou. Pak už jen obnova podle návodu níž.

### 1. Nástroj na RENDCAPP

**Certify The Web** z <https://certifytheweb.com> - běžný instalátor pro
Windows, bezplatná edice stačí (limit je pár certifikátů). Je to grafický
nástroj, takže se nikde nepíšou příkazy.

### 2. Nový certifikát

1. **New Certificate**.
2. Vybrat web `RenoWorkshopApi` z IIS. Nástroj si z něj předvyplní doménu -
   zkontroluj, že je tam `renoworkshop.renocar.cz` a nic navíc.
3. Záložka **Authorization** → **Challenge Type**: `dns-01`.
4. **DNS Update Method**: `(Manual DNS Update)`. Tím se nástroj u ověření
   zastaví a vypíše hodnotu, kterou má kolega vložit.

### 3. Nanečisto

Než zavoláš kolegu, klikni na **Request Certificate** a počkej, až se objeví
okno s hodnotou TXT záznamu. Tím sis ověřil, že je nastavení správně, a víš,
jak to okno vypadá. **Zavři ho / zruš** - certifikát se nevydá a nic se
nepokazí.

Staging režim kvůli tomu zapínat nemusíš: neúspěšných pokusů povoluje
Let's Encrypt pět za hodinu, což je na dvě zaváhání dost.

### 4. Ostré vydání

1. Zavolej kolegovi, ať je u DNS ve WEDOS.
2. **Request Certificate**. Objeví se hodnota pro
   `_acme-challenge.renoworkshop.renocar.cz`.
3. Kolega ji vloží jako TXT záznam.
4. Ověř, že je záznam vidět zvenčí - **až pak** potvrď pokračování:

```powershell
Resolve-DnsName _acme-challenge.renoworkshop.renocar.cz -Type TXT -Server 8.8.8.8
```

Musí vrátit přesně tu hodnotu z nástroje. Když ne, počkej minutu a zkus
znovu; WEDOS to obvykle rozšíří do pár minut.

5. Potvrď pokračování. Nástroj certifikát stáhne, uloží do úložiště Windows
   a naváže na HTTPS binding webu.
6. Kolega TXT záznam smaže.

### 5. Ověření

```powershell
Invoke-RestMethod https://renoworkshop.renocar.cz:8444/health
```

Bez `-SkipCertificateCheck`. Když projde, je certifikát důvěryhodný a appka
se připojí.

### 6. Zapsat si datum

Do tabulky výš a do kalendáře dvě připomínky. Za 90 dní certifikát vyprší
a appka přestane fungovat všem naráz.

### 7. Přepnout aplikaci na ostrá data

Teprve teď má smysl. V `.github/workflows/sestaveni.yml` v repozitáři
aplikace se doplní adresa API:

```
--dart-define=API_BASE_URL=https://renoworkshop.renocar.cz:8444/api/
```

Adresa musí končit lomítkem. Po sestavení ukáže obrazovka Nastavení
u „Zdroje dat" hodnotu **Servisní systém** místo **Ukázková data**.

## Kdo co dělá

| Krok | Kdo |
|---|---|
| spuštění obnovy na RENDCAPPu | správce služby |
| zápis TXT záznamu ve WEDOS | kolega se přístupem k DNS |

Ověřovací TXT záznam je **jednorázový kód, při každé obnově jiný**. Nedá se
připravit dopředu — vzniká až ve chvíli, kdy o certifikát požádáš. Proto
musíte být u toho oba, je to otázka pěti minut.

## Kdy

Certifikát platí 90 dní. Obnovu dělej **po 60. dni**, ať zbývá měsíc rezervy,
kdyby kolega nebyl k zastižení.

Do kalendáře si dej **dvě** připomínky — na 60. a 75. den. Jedna se dá
přehlédnout.

| Vydáno | Platí do | Obnovit mezi |
|---|---|---|
| _doplň při vydání_ | _+90 dní_ | _+60 až +75 dní_ |

## Postup obnovy

1. Na RENDCAPPu spusť **Certify The Web** (nebo nástroj, kterým byl certifikát
   vydaný) a dej u certifikátu `renoworkshop.renocar.cz` **Request/Renew**.
2. Nástroj vypíše hodnotu TXT záznamu pro
   `_acme-challenge.renoworkshop.renocar.cz`.
3. Pošli ji kolegovi, ať ji vloží do DNS ve WEDOS. Starou hodnotu přepíše.
4. Počkej pár minut, než se změna rozšíří, a potvrď v nástroji pokračování.
5. Nástroj certifikát stáhne, uloží do úložiště Windows a **naváže na binding**
   webu `RenoWorkshopApi` v IIS. Nic dalšího se nepřenastavuje.
6. Kolega může TXT záznam smazat, už není potřeba.

## Ověření, že je hotovo

```powershell
Invoke-RestMethod https://renoworkshop.renocar.cz:8444/health
```

Bez `-SkipCertificateCheck`. Když projde, certifikát je důvěryhodný.

Datum platnosti zkontroluješ takhle:

```powershell
$tcp = [Net.Sockets.TcpClient]::new('renoworkshop.renocar.cz', 8444)
$ssl = [Net.Security.SslStream]::new($tcp.GetStream())
$ssl.AuthenticateAsClient('renoworkshop.renocar.cz')
$cert = [Security.Cryptography.X509Certificates.X509Certificate2]$ssl.RemoteCertificate
"Platí do: $($cert.NotAfter)  (zbývá $(($cert.NotAfter - (Get-Date)).Days) dní)"
$ssl.Dispose(); $tcp.Dispose()
```

Tenhle příkaz si klidně pusť kdykoli — je to nejrychlejší způsob, jak zjistit,
jestli se blíží konec platnosti.

## Až to začne otravovat

Ruční obnova je vědomé rozhodnutí, ne opomenutí. Kdyby se ukázalo, že je to
na obtíž, dvě cesty ven:

- **WAPI od WEDOS** — API na správu DNS. Kolega ho zapne, doplní se skript,
  který TXT záznam zakládá a maže sám, a obnova pak probíhá bez lidí.
- **Roční certifikát od placené autority** — jedno ověření ročně místo čtyř,
  některé autority umí ověřit i e-mailem bez zásahu do DNS.
