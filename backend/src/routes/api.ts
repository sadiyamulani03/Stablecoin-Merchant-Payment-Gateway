import type {FastifyInstance} from "fastify";
import {z} from "zod";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import {isAddress} from "ethers";
import mongoose from "mongoose";
import {Merchant,Payment,Subscription,WebhookEvent} from "../models/index.js";
import {getChain} from "../config/chains.js";
import {createOnchainIntent,getOnchainPayment,submitRefund} from "../services/chain.js";

/**
 * Require MongoDB to be connected before processing DB-dependent routes.
 * Returns 503 if the database is not available.
 */
function requireDb(req:any,reply:any,done:any){
  const state=mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if(state!==1){
    return reply.code(503).send({error:"Database unavailable",code:"DB_UNAVAILABLE"});
  }
  done();
}

const onboardSchema=z.object({name:z.string().min(2),tradeLicense:z.string().min(2),emirate:z.string().min(2),category:z.string().min(2),settlementPreference:z.enum(["stablecoin","partner-fiat"]).default("stablecoin"),walletAddress:z.string().refine(isAddress),email:z.string().email(),password:z.string().min(10)});

export async function registerRoutes(app:FastifyInstance){
  app.post("/api/merchants/onboard",{preHandler:requireDb},async(req,reply)=>{
    const parsed=onboardSchema.safeParse(req.body); if(!parsed.success)return reply.code(400).send({error:"Invalid onboarding details",details:parsed.error.flatten()});
    const d=parsed.data; const exists=await Merchant.findOne({email:d.email}); if(exists)return reply.code(409).send({error:"Email already registered"});
    const merchant=await Merchant.create({...d,passwordHash:await bcrypt.hash(d.password,12),status:"testnet_active"});
    const token=app.jwt.sign({merchantId:String(merchant._id),email:merchant.email},{expiresIn:"12h"});
    return reply.code(201).send({merchantId:String(merchant._id),walletAddress:merchant.walletAddress,status:merchant.status,token});
  });
  app.post("/api/auth/login",{preHandler:requireDb},async(req,reply)=>{
    const body=z.object({email:z.string().email(),password:z.string()}).safeParse(req.body);if(!body.success)return reply.code(400).send({error:"Invalid credentials"});
    const merchant=await Merchant.findOne({email:body.data.email});if(!merchant||!(await bcrypt.compare(body.data.password,merchant.passwordHash)))return reply.code(401).send({error:"Invalid email or password"});
    return {token:app.jwt.sign({merchantId:String(merchant._id),email:merchant.email},{expiresIn:"12h"}),merchantId:String(merchant._id),name:merchant.name};
  });
  app.get("/api/merchants/:id",{preHandler:[app.authenticate,requireDb]},async(req:any,reply)=>{
    if(req.user.merchantId!==req.params.id)return reply.code(403).send({error:"Forbidden"});
    const merchant=await Merchant.findById(req.params.id).select("-passwordHash");if(!merchant)return reply.code(404).send({error:"Merchant not found"});
    const [count,paid]=await Promise.all([Payment.countDocuments({merchantId:merchant._id}),Payment.countDocuments({merchantId:merchant._id,status:"paid"})]);
    return {merchant,stats:{paymentCount:count,paidCount:paid}};
  });
  app.post("/api/payments/create",{preHandler:[app.authenticate,requireDb]},async(req:any,reply)=>{
    const body=z.object({merchantId:z.string(),amount:z.string().regex(/^\d+(\.\d{1,2})?$/),description:z.string().max(200).default(""),chain:z.enum(["adi-testnet","polygon-amoy"]).default("adi-testnet")}).safeParse(req.body);
    if(!body.success)return reply.code(400).send({error:"Invalid payment details"});
    if(req.user.merchantId!==body.data.merchantId)return reply.code(403).send({error:"Forbidden"});
    const merchant=await Merchant.findById(body.data.merchantId);if(!merchant)return reply.code(404).send({error:"Merchant not found"});
    const chain=getChain(body.data.chain);
    try{
      const created=await createOnchainIntent(body.data.chain,merchant.walletAddress,body.data.amount);
      const expiresAt=new Date(Date.now()+60*60*1000);
      const payment=await Payment.create({paymentId:created.paymentId,chain:body.data.chain,merchantId:merchant._id,amount:body.data.amount,description:body.data.description,tokenAddress:chain.tokenAddress,status:"pending",expiresAt});
      const payload={paymentId:created.paymentId,amount:body.data.amount,currency:"AED",merchant:merchant.name,network:chain.key,token:"mDDSC",version:1,chainId:chain.chainId,url:`${process.env.FRONTEND_URL||"http://localhost:3000"}/pay/${created.paymentId}?chain=${chain.key}`};
      return reply.code(201).send({paymentId:payment.paymentId,qrCode:await QRCode.toDataURL(JSON.stringify(payload)),qrPayload:payload,expiresAt,txHash:created.txHash,chain:chain.key});
    }catch(error){return reply.code(503).send({error:error instanceof Error?error.message:"Unable to create on-chain payment"});}
  });
  app.get("/api/payments/:paymentId",{preHandler:requireDb},async(req:any,reply)=>{
    const chainKey=String(req.query.chain||"adi-testnet");
    let chain;
    try{chain=getChain(chainKey);}catch{return reply.code(400).send({error:"Unsupported chain. Use adi-testnet or polygon-amoy."});}
    const payment=await Payment.findOne({paymentId:req.params.paymentId,chain:chain.key});if(!payment)return reply.code(404).send({error:"Payment not found"});
    try{
      const onchain=await getOnchainPayment(chain.key,payment.paymentId);
      const statuses=["missing","pending","paid","refunded","expired"];
      let status=statuses[onchain.status]||"unknown";
      if(status==="pending" && Date.now() > (onchain.createdAt + 3600) * 1000) status="expired";
      if(status!=="missing"&&payment.status!==status){payment.status=status as any;if(status==="paid"){payment.customerAddress=onchain.customer;payment.settledAt=new Date(onchain.paidAt*1000);}await payment.save();}
      return {paymentId:payment.paymentId,status,amount:payment.amount,settledAt:payment.settledAt,settlementMethod:"on-chain",chain:chainKey,txHash:payment.txHash};
    }catch{return {paymentId:payment.paymentId,status:payment.status,amount:payment.amount,settledAt:payment.settledAt,settlementMethod:"on-chain",chain:chainKey};}
  });
  app.post("/api/payments/:paymentId/refund",{preHandler:[app.authenticate,requireDb]},async(req:any,reply)=>{
    const body=z.object({reason:z.string().min(3).max(500),chain:z.enum(["adi-testnet","polygon-amoy"]).default("adi-testnet")}).safeParse(req.body);if(!body.success)return reply.code(400).send({error:"Refund reason and chain required"});
    const payment=await Payment.findOne({paymentId:req.params.paymentId,chain:body.data.chain});if(!payment)return reply.code(404).send({error:"Payment not found"});
    if(String(payment.merchantId)!==req.user.merchantId)return reply.code(403).send({error:"Forbidden"});
    try{const result=await submitRefund(body.data.chain,payment.paymentId);payment.status="refunded";await payment.save();return {refundId:result.txHash,status:"submitted",txHash:result.txHash};}
    catch(error){return reply.code(503).send({error:error instanceof Error?error.message:"Refund failed"});}
  });
  app.post("/api/subscriptions/create",{preHandler:app.authenticate},async(req:any,reply)=>{
    const body=z.object({merchantId:z.string(),customerAddress:z.string().refine(isAddress),amount:z.string().regex(/^\d+(\.\d{1,2})?$/),period:z.enum(["monthly","weekly"]),initialTopUp:z.string().regex(/^\d+(\.\d{1,2})?$/),chain:z.enum(["adi-testnet","polygon-amoy"]).default("adi-testnet"),customerPrivateKey:z.string().optional()}).safeParse(req.body);
    if(!body.success)return reply.code(400).send({error:"Invalid subscription details"});if(req.user.merchantId!==body.data.merchantId)return reply.code(403).send({error:"Forbidden"});
    // Customer-owned escrow must be signed by the customer. Never send a customer private key to this server in a real deployment.
    return reply.code(501).send({error:"Customer-signed subscription creation is not exposed through this merchant endpoint. Use the customer wallet flow; do not submit a customer private key to the API."});
  });
  app.get("/api/subscriptions",{preHandler:[app.authenticate,requireDb]},async(req:any,reply)=>{
    const merchantId=String(req.query.merchantId||"");if(merchantId!==req.user.merchantId)return reply.code(403).send({error:"Forbidden"});
    return {subscriptions:await Subscription.find({merchantId}).sort({createdAt:-1}).lean()};
  });
  app.post("/api/subscriptions/:id/charge",{preHandler:app.authenticate},async(_req:any,reply)=>reply.code(501).send({error:"Subscription charge automation is not enabled in this testnet package. Charge only after an explicit customer authorization flow is implemented."}));
  app.get("/api/analytics/summary",{preHandler:[app.authenticate,requireDb]},async(req:any,reply)=>{
    const merchantId=String(req.query.merchantId||"");if(merchantId!==req.user.merchantId)return reply.code(403).send({error:"Forbidden"});
    const paid=await Payment.find({merchantId,status:"paid"}).lean();const volume=paid.reduce((sum,p)=>sum+Number(p.amount),0);
    return {totalVolume:volume.toFixed(2),txCount:paid.length,avgTicket:paid.length?(volume/paid.length).toFixed(2):"0.00",topMerchants:[]};
  });
  app.post("/api/webhooks/chain",{preHandler:requireDb},async(req,reply)=>{
    const secret=process.env.WEBHOOK_SECRET;if(!secret)return reply.code(503).send({error:"Webhook secret not configured"});
    const crypto=await import("node:crypto");const supplied=req.headers["x-webhook-signature"];
    const raw=JSON.stringify(req.body);const expected=crypto.createHmac("sha256",secret).update(raw).digest("hex");
    if(typeof supplied!=="string"||supplied.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return reply.code(401).send({error:"Invalid webhook signature"});
    const body=z.object({eventId:z.string().min(8),event:z.enum(["PaymentSettled","PaymentRefunded"]),paymentId:z.string(),chain:z.enum(["adi-testnet","polygon-amoy"])}).safeParse(req.body);
    if(!body.success)return reply.code(400).send({error:"Invalid webhook payload"});
    // Persist unique event IDs to make retries idempotent and reject replayed notifications.
    try { await WebhookEvent.create({eventId:body.data.eventId,payloadHash:crypto.createHash("sha256").update(raw).digest("hex")}); }
    catch (error) { if ((error as {code?:number}).code === 11000) return {accepted:true,duplicate:true,eventId:body.data.eventId}; throw error; }
    // Payment state remains independently checked against RPC on GET.
    return {accepted:true,eventId:body.data.eventId};
  });
}
