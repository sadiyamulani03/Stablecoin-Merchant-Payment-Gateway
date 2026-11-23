import dotenv from "dotenv";
dotenv.config({path: process.env.ENV_FILE || "../.env"});
dotenv.config();
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import {pathToFileURL} from "node:url";
import {registerAuth} from "./plugins/auth.js";
import {registerRoutes} from "./routes/api.js";
import {connectDb,disconnectDb,isDbConnected} from "./lib/prisma.js";

type OriginPolicy={exact:Set<string>;suffixes:string[]};

function buildOriginPolicy(raw:string|undefined):OriginPolicy{
  const exact=new Set<string>();
  const suffixes:string[]=[];
  for(const entry of (raw||"http://localhost:3000").split(",")){
    const value=entry.trim().replace(/^https?:\/\//i,"").replace(/\/+$/,"");
    if(!value||value==="*")continue;
    if(value.startsWith("*.")){
      suffixes.push(value.slice(1).toLowerCase());
      continue;
    }
    exact.add(value.toLowerCase());
  }
  return {exact,suffixes};
}

function isOriginAllowed(origin:string,policy:OriginPolicy){
  const value=origin.replace(/\/+$/,"").replace(/^https?:\/\//i,"").toLowerCase();
  if(policy.exact.has(value))return true;
  return policy.suffixes.some(suffix=>value.endsWith(suffix)&&value.length>suffix.length);
}

export async function buildServer(){
  const app=Fastify({
    logger:{level:process.env.LOG_LEVEL||"info",redact:{paths:["req.headers.authorization","req.headers.cookie","req.headers[\"x-webhook-signature\"]"],remove:true}},
    bodyLimit:1024*1024,
    trustProxy:true,
  });
  const originPolicy=buildOriginPolicy(process.env.CORS_ORIGIN);
  await app.register(cors,{
    origin:(origin,cb)=>{
      if(!origin)return cb(null,true);
      cb(null,isOriginAllowed(origin,originPolicy));
    },
    credentials:true,
    methods:["GET","POST","OPTIONS"],
    allowedHeaders:["Content-Type","Authorization","x-webhook-signature"],
    maxAge:86400,
  });
  app.log.info("CORS allowed origins: %s",[...originPolicy.exact,...originPolicy.suffixes.map(s=>"*"+s)].join(", ")||"(none)");
  const defaultJwtSecret="development-only-change-this-secret-before-deploying";
  const jwtSecret=process.env.JWT_SECRET||defaultJwtSecret;
  if(process.env.NODE_ENV==="production"){
    if(!process.env.JWT_SECRET||jwtSecret===defaultJwtSecret)throw new Error("JWT_SECRET must be set in production");
    if(jwtSecret.length<32)throw new Error("JWT_SECRET must be at least 32 characters");
    if(!process.env.WEBHOOK_SECRET)app.log.warn("WEBHOOK_SECRET is not set; webhook delivery will be rejected with 503");
  }
  await app.register(jwt,{secret:jwtSecret});
  await registerAuth(app);
  app.get("/health",async()=>({status:"ok",service:"stablecoin-gateway-api",database:"mysql",mysql:isDbConnected()?"connected":"disconnected",networks:[{key:"adi-testnet",chainId:99999},{key:"polygon-amoy",chainId:80002}]}));
  await registerRoutes(app);
  return app;
}

async function connectDatabase(app:Fastify.FastifyInstance){
  const url=process.env.DATABASE_URL;
  if(!url){
    app.log.warn("DATABASE_URL is not configured; database-dependent routes will return 503");
    return;
  }
  try{
    await connectDb();
    if(isDbConnected())app.log.info("MySQL connected");
  }catch(err){
    app.log.error("MySQL connection failed: %s",err instanceof Error?err.message:String(err));
  }
}

const start=async()=>{
  const app=await buildServer();
  void connectDatabase(app).catch((err)=>app.log.error("MySQL initialization error: %s",err instanceof Error?err.message:String(err)));
  const port=Number.parseInt(process.env.PORT||"4000",10);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error(`Invalid PORT value: ${String(process.env.PORT)}`);
  const host=process.env.HOST||"0.0.0.0";
  await app.listen({port,host});
  const shutdown=async(signal:string)=>{
    app.log.info("Received %s, shutting down",signal);
    try{await app.close();}catch(err){app.log.error("Error while closing the HTTP server: %s",err instanceof Error?err.message:String(err));}
    try{await disconnectDb();}catch(err){app.log.error("Error while closing the MySQL connection: %s",err instanceof Error?err.message:String(err));}
    process.exit(0);
  };
  process.once("SIGTERM",()=>{void shutdown("SIGTERM");});
  process.once("SIGINT",()=>{void shutdown("SIGINT");});
};
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)start().catch((error)=>{console.error(error);process.exit(1);});
