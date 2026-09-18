/**
 * Čas do databáze.
 *
 * V databázi je všude **místní čas serveru**, bez zóny:
 *   - údaje z Heliosu (datum přijetí, termín) tam takhle přicházejí
 *     z ERP přes linkovaný server,
 *   - API je posílá dál jako `2026-09-18T10:05:00` a aplikace je tak
 *     i zobrazuje.
 *
 * Node ale pracuje s okamžikem v UTC a Prisma ho tak i zapíše do
 * `DATETIME2`. Poznámka napsaná v 10:05 se pak uložila jako 08:05 a
 * v aplikaci svítila o dvě hodiny dřív. `mistniCas` proto posune okamžik
 * tak, aby se do databáze zapsaly číslice místního času.
 */
export function mistniCas(ted: Date = new Date()): Date {
  return new Date(ted.getTime() - ted.getTimezoneOffset() * 60_000);
}
