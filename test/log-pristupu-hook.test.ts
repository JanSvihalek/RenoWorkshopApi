import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { zapsane } = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "sqlserver://test";
  process.env.FIREBASE_PROJECT_ID ??= "test";
  return { zapsane: [] as Record<string, unknown>[] };
});

vi.mock("../src/db.js", () => ({
  prisma: {
    zaznamPristupu: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        zapsane.push(data);
        return data;
      }),
    },
  },
}));

const { zaznamenavejPristupy } = await import("../src/log-pristupu.js");

/** Stejné uspořádání jako v server.ts, jen místo Firebase hlavička. */
async function sluzba(): Promise<FastifyInstance> {
  const server = Fastify();
  await server.register(
    async (chranene) => {
      zaznamenavejPristupy(chranene);
      chranene.addHook("preHandler", async (request, reply) => {
        if (request.headers.authorization !== "Bearer ok") {
          await reply.code(401).send({
            error: { code: "unauthorized", message: "Chybí přihlášení." },
          });
          return;
        }
        request.zamestnanec = {
          uid: "u1",
          email: "jan.dvorak@renocar.cz",
          jmeno: "Jan Dvořák",
        };
      });
      chranene.get("/orders/search", async () => []);
      chranene.post<{ Params: { id: string } }>(
        "/orders/:id/notes",
        async (_request, reply) =>
          reply.code(409).send({
            error: { code: "order_closed", message: "Zakázka je uzavřená." },
          }),
      );
    },
    { prefix: "/api" },
  );
  return server;
}

/** Zápis běží až po odpovědi - chvíli počkat, než doběhne. */
const pockej = () => new Promise((hotovo) => setTimeout(hotovo, 20));

describe("log přístupů ve službě", () => {
  beforeEach(() => {
    zapsane.length = 0;
  });

  it("zapíše přihlášený požadavek bez hledaného textu", async () => {
    const server = await sluzba();
    const odpoved = await server.inject({
      method: "GET",
      url: "/api/orders/search?q=Petr%20Nov%C3%A1k",
      headers: { authorization: "Bearer ok" },
    });
    await pockej();

    expect(odpoved.statusCode).toBe(200);
    expect(zapsane).toHaveLength(1);
    expect(zapsane[0]).toMatchObject({
      metoda: "GET",
      cesta: "/api/orders/search",
      email: "jan.dvorak@renocar.cz",
      stav: 200,
      chyba: null,
    });
    expect(JSON.stringify(zapsane[0])).not.toContain("Nov");
  });

  it("zapíše i odmítnutý požadavek bez přihlášení", async () => {
    const server = await sluzba();
    await server.inject({ method: "GET", url: "/api/orders/search" });
    await pockej();

    expect(zapsane[0]).toMatchObject({
      stav: 401,
      email: null,
      chyba: "unauthorized: Chybí přihlášení.",
    });
  });

  it("u chyby zapíše zakázku a zprávu, ne obsah poznámky", async () => {
    const server = await sluzba();
    await server.inject({
      method: "POST",
      url: "/api/orders/Z1212600123/notes",
      headers: { authorization: "Bearer ok" },
      payload: { text: "Zákazník nechce volat na mobil 777123456" },
    });
    await pockej();

    expect(zapsane[0]).toMatchObject({
      cesta: "/api/orders/:id/notes",
      zakazka: "Z1212600123",
      stav: 409,
      chyba: "order_closed: Zakázka je uzavřená.",
    });
    expect(JSON.stringify(zapsane[0])).not.toContain("777123456");
  });
});
