import type {FastifyInstance, FastifyRequest, FastifyReply} from "fastify";

export async function registerAuth(app: FastifyInstance) {
  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try { await request.jwtVerify(); }
    catch { return reply.code(401).send({error:"Unauthorized"}); }
  });
}

declare module "fastify" {
  interface FastifyInstance { authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>; }
}

declare module "@fastify/jwt" {
  interface FastifyJWT { payload: {merchantId:string; email:string}; user: {merchantId:string; email:string}; }
}
