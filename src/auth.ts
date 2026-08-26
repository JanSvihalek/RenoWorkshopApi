import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { readFileSync } from 'node:fs';

import { config } from './config.js';

/**
 * Ověření přihlášení. Mobilní aplikace posílá Firebase ID token; ověřuje se
 * tady, ne v aplikaci - klientským kontrolám se věřit nedá.
 *
 * Účty spravuje IT v Entra ID, aplikace je jen spotřebovává. Role zatím
 * nejsou: kdo se přihlásí firemním účtem, má stejná práva. Až se namapují
 * skupiny z Entra ID, přibude kontrola sem.
 */
if (getApps().length === 0) {
  const cesta = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  initializeApp({
    projectId: config.FIREBASE_PROJECT_ID,
    credential: cesta ? cert(JSON.parse(readFileSync(cesta, 'utf8'))) : applicationDefault(),
  });
}

export type Zamestnanec = {
  uid: string;
  email: string | null;
  jmeno: string | null;
};

declare module 'fastify' {
  interface FastifyRequest {
    zamestnanec?: Zamestnanec;
  }
}

export async function overPrihlaseni(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const hlavicka = request.headers.authorization;
  if (!hlavicka?.startsWith('Bearer ')) {
    await reply.code(401).send({
      error: { code: 'unauthorized', message: 'Chybí přihlášení.' },
    });
    return;
  }

  try {
    const token = await getAuth().verifyIdToken(hlavicka.slice(7));
    request.zamestnanec = {
      uid: token.uid,
      email: token.email ?? null,
      jmeno: (token.name as string | undefined) ?? null,
    };
  } catch {
    // Nerozlišujeme vypršelý a podvržený token - uživateli je to jedno
    // a útočníkovi to nemá co napovídat.
    await reply.code(401).send({
      error: { code: 'unauthorized', message: 'Přihlášení vypršelo.' },
    });
  }
}
