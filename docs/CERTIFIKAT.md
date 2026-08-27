# Certifikát: vydání a obnova

Služba běží za IIS na HTTPS a mobilní aplikace **nepřijme nedůvěryhodný
certifikát** — na rozdíl od prohlížeče nejde nic odkliknout. Když certifikát
vyprší, appka ze dne na den přestane fungovat všem.

Certifikát je od **Let's Encrypt**, platí **90 dní** a obnovuje se **ručně**,
protože ověření vlastnictví domény vyžaduje zápis do DNS ve WEDOS a k tomu
nemá služba přístup.

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
