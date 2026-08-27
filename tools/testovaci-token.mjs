/**
 * Vypíše Firebase ID token, kterým jde zavolat API bez mobilu.
 *
 * K čemu: ověřit, že služba opravdu vrací zakázky z databáze, ještě než
 * je hotový certifikát a než se dá appka nainstalovat do telefonu.
 *
 * Použití (ve složce projektu, kde je .env a secrets/):
 *   node tools/testovaci-token.mjs
 *
 * Token platí hodinu. Volá se s ním takhle:
 *   $t = node tools/testovaci-token.mjs
 *   Invoke-RestMethod http://localhost:8092/api/orders -Headers @{ Authorization = "Bearer $t" }
 *
 * Pozor: token má stejná práva jako přihlášený zaměstnanec. Nikam ho
 * neposílej a po ověření zavři okno - zůstává v historii PowerShellu.
 *
 * Vedlejší efekt: ve Firebase Authentication vznikne uživatel
 * `diagnostika-api`. Klidně ho pak smaž, appka ho nepoužívá.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';

process.loadEnvFile?.();

const cestaKlic = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!cestaKlic) {
  console.error('Chybí GOOGLE_APPLICATION_CREDENTIALS v .env.');
  process.exit(1);
}

// Klíč webového rozhraní Firebase. Není tajný - je i v mobilní aplikaci -
// a slouží jen k výměně vlastního tokenu za ID token.
const webovyKlic =
  process.env.FIREBASE_WEB_API_KEY ?? 'AIzaSyCvfEit8f_byaKzeLMgRmY22A3mwNHsRJ0';

initializeApp({ credential: cert(JSON.parse(readFileSync(cestaKlic, 'utf8'))) });

const vlastniToken = await getAuth().createCustomToken('diagnostika-api', {
  poznamka: 'testovaci pristup bez mobilu',
});

const odpoved = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${webovyKlic}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: vlastniToken, returnSecureToken: true }),
  },
);

const data = await odpoved.json();

if (!odpoved.ok || !data.idToken) {
  console.error('Výměna tokenu selhala:', JSON.stringify(data, null, 2));
  process.exit(1);
}

// Jen token, nic víc - ať se dá výstup rovnou uložit do proměnné.
console.log(data.idToken);
