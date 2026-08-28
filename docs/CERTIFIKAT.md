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

Jednou. Pak už jen obnova, která je stejná bez prvních dvou kroků.

Popisky odpovídají **Certify Certificate Manager 7.2** - ověřeno proklikáním.

### 1. Nástroj na RENDCAPP

**Certify The Web** z <https://certifytheweb.com>. Bezplatná edice stačí;
titulek okna hlásí *Evaluation Mode - Unlicensed*, což na pár certifikátů
nevadí, ale ověř si aktuální podmínky, ať tě to nepřekvapí.

### 2. Účet u Let's Encrypt

`Settings` → sekce s certifikačními autoritami → u **Let's Encrypt**
zaregistruj účet (e-mail a souhlas s podmínkami).

Bez toho skončí požadavek hláškou
`Failed to match ACME account for managed certificate`. Ostrá a testovací
autorita mají **oddělené účty**; registrace z laptopu se na server nepřenáší.

### 3. Nový certifikát

`New Certificate`, pak po kartách:

**Identifiers**
- `Use Certificate Subscription`: vypnuto
- `Select Site`: web `RenoWorkshopApi`
- `Add identifiers`: `renoworkshop.renocar.cz` → zelené **+**
- v seznamu zaškrtnout `INCLUDE` i kolečko `PRIMARY`

**Authorization**
- `Challenge Type`: **dns-01**
- `DNS Update Method`: **(Update DNS Manually)**
- `Email to Notify`: tvůj e-mail - přijde upozornění, až to bude čekat
  na TXT záznam
- `CNAME Delegation Rule`: prázdné

**Advanced → Certificate Authority**
- autorita: **Let's Encrypt**
- `Use Staging Mode (Test Certificates)`: **vypnuto** (zapíná se jen na
  zkoušku nanečisto)
- `Disable automatic failover to an alternative Certificate Authority`:
  **zaškrtnuto** - jinak může nástroj při potížích sáhnout po jiné autoritě

**Advanced → General Options**
- `Enable Auto Renewal`: **vypnuto**. Automatická obnova nemůže fungovat,
  když se TXT záznam zakládá ručně - jen by se opakovaně pokoušela a padala.
- `Notify Primary Contact On Renewal Failure`: zapnuto

**Advanced → Signing & Security**: nechat výchozí.

**Deployment**: web `RenoWorkshopApi`, binding na portu 8444.

Pak `Save`.

### 4. Vydání

Kolega musí být u DNS ve WEDOS, je to na pět minut.

1. `Request Certificate`.
2. Nástroj vypíše název a hodnotu TXT záznamu.
3. Kolega je vloží (viz [tabulka níž](#co-předat-kolegovi)).
4. **Ověř, že je záznam vidět zvenčí:**

```powershell
Resolve-DnsName _acme-challenge.renoworkshop.renocar.cz -Type TXT -Server 8.8.8.8
```

   Musí vrátit přesně tu hodnotu z nástroje.
5. **Až potom** potvrď v nástroji pokračování.
6. Certifikát se stáhne, uloží do úložiště Windows a naváže na binding.
7. Kolega TXT záznam smaže.

### Co předat kolegovi

| | |
|---|---|
| Typ | TXT |
| Doména | renocar.cz |
| Název | `_acme-challenge.renoworkshop` |
| Hodnota | dlouhý řetězec z nástroje, doslova |
| TTL | co nejnižší, klidně 300 |

Do políčka pro název se ve WEDOSu píše jen část **před** doménou. Kdyby tam
dal celé `_acme-challenge.renoworkshop.renocar.cz`, vznikne záznam pro
`...renocar.cz.renocar.cz` a ověření selže. Po uložení ať zkontroluje, jak
se záznam v přehledu zóny tváří.

**Pozor na `-test` v názvu.** Kontrola tlačítkem `Test` v nástroji si říká
o `_acme-challenge-test.renoworkshop.renocar.cz`. To je jeho vlastní
prověrka, ne výzva od Let's Encrypt - protokol ACME má název pevně daný
a příponu `-test` nezná. Skutečné ověření vždycky potřebuje
`_acme-challenge.renoworkshop.renocar.cz`.

### 5. Ověření

```powershell
Invoke-RestMethod https://renoworkshop.renocar.cz:8444/health
```

Bez `-SkipCertificateCheck`. Když projde, je certifikát důvěryhodný.

### 6. Zapsat datum

Do tabulky výš a do kalendáře dvě připomínky (60. a 75. den). Za 90 dní
certifikát vyprší a aplikace přestane fungovat všem naráz.

### 7. Přepnout aplikaci na ostrá data

Teprve teď to má smysl. V repozitáři aplikace se do
`.github/workflows/sestaveni.yml` doplní adresa API:

```
--dart-define=API_BASE_URL=https://renoworkshop.renocar.cz:8444/api/
```

Adresa musí končit lomítkem. Po sestavení ukáže obrazovka Nastavení
u „Zdroje dat" hodnotu **Servisní systém** místo **Ukázková data**.

## Zkouška nanečisto

Než to poběží doopravdy, dá se celý postup projít bez následků: na kartě
**Advanced → Certificate Authority** zaškrtnout `Use Staging Mode`.
Certifikát z testovací autority není důvěryhodný a k ničemu se nepoužije,
ale postup je stejný a nespotřebovávají se limity ostré autority (5
neúspěšných ověření za hodinu, 50 certifikátů týdně na doménu).

Nejužitečnější část zkoušky zvládneš i bez kolegy: dojdi až k oknu
s hodnotou TXT záznamu a skonči. Tím sis ověřil, že je vše nastavené
správně.

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
