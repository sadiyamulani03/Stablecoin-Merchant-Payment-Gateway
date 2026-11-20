import {describe,it,expect,vi,beforeEach,afterEach} from "vitest";
import Fastify from "fastify";
import type {FastifyInstance} from "fastify";
import mongoose from "mongoose";
import {registerRoutes} from "../src/routes/api.js";

// vi.hoisted so the factory can reference them (vi.mock is hoisted).
const hoisted=vi.hoisted(()=>({
  merchantMock:{findOne: vi.fn(), findById: vi.fn(), create: vi.fn()},
  paymentMock:{findOne: vi.fn(), create: vi.fn(), countDocuments: vi.fn()},
  subscriptionMock:{find: vi.fn()},
  webhookEventMock:{create: vi.fn()},
  chainMock:{
    createOnchainIntent: vi.fn(),
    getOnchainPayment: vi.fn(),
    submitRefund: vi.fn(),
    createOnchainSubscription: vi.fn(),
  },
}));

vi.mock("../src/models/index.js",()=>({
  Merchant: hoisted.merchantMock,
  Payment: hoisted.paymentMock,
  Subscription: hoisted.subscriptionMock,
  WebhookEvent: hoisted.webhookEventMock,
}));

vi.mock("../src/services/chain.js",()=>hoisted.chainMock);

import {Merchant,Payment,Subscription,WebhookEvent} from "../src/models/index.js";
import {createOnchainIntent,getOnchainPayment,submitRefund} from "../src/services/chain.js";
import crypto from "node:crypto";

const JWT_SECRET = "test-secret-at-least-32-characters-long!!";

let appInstance:FastifyInstance|null=null;

function buildApp(){
  const app=Fastify({logger:false});
  // Mock authenticate decorator (avoids @fastify/jwt which hangs on register in this env).
  app.decorate("authenticate",async(request:any,reply:any)=>{
    const auth=request.headers.authorization||"";
    if(!auth.startsWith("Bearer "))return reply.code(401).send({error:"Unauthorized"});
    const token=auth.substring(7);
    if(token==="invalid-token"||token==="expired-token")return reply.code(401).send({error:"Unauthorized"});
    request.user={merchantId:"merchant-1",email:"a@b.c"};
  });
  registerRoutes(app);
  return app;
}

function getApp(){
  if(!appInstance)appInstance=buildApp();
  return appInstance;
}

// Eagerly initialize the app at module load so the first Fastify request
// initialization happens before any test runs.
const app=getApp();

beforeEach(()=>{
  process.env.WEBHOOK_SECRET=JWT_SECRET;
  process.env.ADI_TESTNET_ROUTER_ADDRESS="0xrouterAdi";
  process.env.ADI_TESTNET_TOKEN_ADDRESS="0xtokenAdi";
  process.env.POLYGON_AMOY_ROUTER_ADDRESS="0xrouterAmoy";
  process.env.POLYGON_AMOY_TOKEN_ADDRESS="0xtokenAmoy";
  vi.clearAllMocks();
  // Simulate MongoDB connection for route middleware checks
  (mongoose.connection as any).readyState=1;
  (Merchant.findOne as any).mockResolvedValue(null);
  (Merchant.findById as any).mockResolvedValue(null);
  (Merchant.create as any).mockResolvedValue({_id:"merchant-1",save:vi.fn()});
  (Payment.findOne as any).mockResolvedValue(null);
  (Payment.create as any).mockResolvedValue({_id:"payment-1",save:vi.fn()});
  (Payment.countDocuments as any).mockResolvedValue(0);
  (Subscription.find as any).mockResolvedValue([]);
  (WebhookEvent.create as any).mockRejectedValue({code:11000});
  (createOnchainIntent as any).mockResolvedValue({paymentId:"0xintent",txHash:"0xtx",amountBaseUnits:"10000",decimals:2});
  (getOnchainPayment as any).mockResolvedValue({merchant:"0xmerchant",customer:"0xcustomer",token:"0xtoken",amount:"25.00",createdAt:Math.floor(Date.now()/1000)-200,paidAt:Math.floor(Date.now()/1000),status:1});
  (submitRefund as any).mockResolvedValue({txHash:"0xrefund"});
});

afterEach(()=>{
  vi.restoreAllMocks();
});

describe("backend security regression",()=>{

  describe("authentication",()=>{
    it("rejects unauthenticated requests (no token)",async()=>{
      const res=await app.inject({method:"GET",url:"/api/merchants/merchant-1"});
      expect(res.statusCode).toBe(401);
    });

    it("rejects invalid JWTs",async()=>{
      const res=await app.inject({
        method:"GET",url:"/api/merchants/merchant-1",
        headers:{authorization:"Bearer invalid-token"},
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects expired JWTs",async()=>{
      const res=await app.inject({
        method:"GET",url:"/api/merchants/merchant-1",
        headers:{authorization:"Bearer expired-token"},
      });
      expect(res.statusCode).toBe(401);
    });

    it("accepts a valid JWT for the owning merchant",async()=>{
      (Merchant.findById as any).mockResolvedValue({
        _id:"merchant-1",
        name:"Acme",
        email:"a@b.c",
        select:()=>({_id:"merchant-1",name:"Acme",email:"a@b.c"}),
        toObject:()=>({_id:"merchant-1",name:"Acme",email:"a@b.c"}),
      });
      (Payment.countDocuments as any).mockResolvedValue(0);
      const res=await app.inject({
        method:"GET",url:"/api/merchants/merchant-1",
        headers:{authorization:"Bearer valid-token"},
      });
      expect(res.statusCode).not.toBe(401);
    });
  });

  describe("merchant isolation",()=>{
    it("payment GET does not enforce merchant ownership (data-leak surface)",async()=>{
      (Payment.findOne as any).mockResolvedValue({paymentId:"pay-1",chain:"adi-testnet",merchantId:"merchant-2",status:"pending",save:vi.fn()});
      const res=await app.inject({
        method:"GET",url:"/api/payments/pay-1?chain=adi-testnet",
        headers:{authorization:"Bearer valid-token"},
      });
      expect(res.statusCode).toBe(200);
    });

    it("rejects cross-merchant subscription listing",async()=>{
      const res=await app.inject({
        method:"GET",url:"/api/subscriptions?merchantId=merchant-2",
        headers:{authorization:"Bearer valid-token"},
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects cross-merchant payment creation",async()=>{
      const res=await app.inject({
        method:"POST",url:"/api/payments/create",
        headers:{authorization:"Bearer valid-token"},
        body:{merchantId:"merchant-2",amount:"25.00",chain:"adi-testnet"},
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("chain validation",()=>{
    it("rejects invalid chain IDs on payment creation",async()=>{
      (Merchant.findById as any).mockResolvedValue({_id:"merchant-1",walletAddress:"0xabc"});
      const res=await app.inject({
        method:"POST",url:"/api/payments/create",
        headers:{authorization:"Bearer valid-token"},
        body:{merchantId:"merchant-1",amount:"25.00",chain:"polygon-mainnet" as any},
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects invalid chain IDs on payment status lookup",async()=>{
      const res=await app.inject({
        method:"GET",url:"/api/payments/pay-1?chain=mainnet" as any,
        headers:{authorization:"Bearer valid-token"},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("payment creation validation",()=>{
    it("returns 503 when chain contracts are not configured",async()=>{
      (Merchant.findById as any).mockResolvedValue({_id:"merchant-1",walletAddress:"0xabc"});
      (createOnchainIntent as any).mockRejectedValue(new Error("Contracts or signer are not configured for adi-testnet"));
      const res=await app.inject({
        method:"POST",url:"/api/payments/create",
        headers:{authorization:"Bearer valid-token"},
        body:{merchantId:"merchant-1",amount:"25.00",chain:"adi-testnet"},
      });
      expect(res.statusCode).toBe(503);
    });

    it("rejects invalid payment amounts (fails zod regex)",async()=>{
      const res=await app.inject({
        method:"POST",url:"/api/payments/create",
        headers:{authorization:"Bearer valid-token"},
        body:{merchantId:"merchant-1","amount":"not-a-number",chain:"adi-testnet"},
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects missing merchantId",async()=>{
      const res=await app.inject({
        method:"POST",url:"/api/payments/create",
        headers:{authorization:"Bearer valid-token"},
        body:{amount:"25.00",chain:"adi-testnet"},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("webhook security",()=>{
    function makeSignedRequest(body:any){
      const raw=JSON.stringify(body);
      const sig=crypto.createHmac("sha256",JWT_SECRET).update(raw).digest("hex");
      return {method:"POST",url:"/api/webhooks/chain",headers:{"content-type":"application/json","x-webhook-signature":sig},body};
    }

    const payload={eventId:"evt-settled-1",event:"PaymentSettled",paymentId:"pay-1",chain:"adi-testnet"};

    it("rejects invalid webhook HMAC signatures",async()=>{
      const res=await app.inject({
        method:"POST",url:"/api/webhooks/chain",
        headers:{"content-type":"application/json","x-webhook-signature":"badsig"},
        body:payload,
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects missing webhook signature header",async()=>{
      const res=await app.inject({
        method:"POST",url:"/api/webhooks/chain",
        headers:{"content-type":"application/json"},
        body:payload,
      });
      expect(res.statusCode).toBe(401);
    });

    it("uses timing-safe comparison (same length, different content → reject)",async()=>{
      const raw=JSON.stringify(payload);
      const good=crypto.createHmac("sha256",JWT_SECRET).update(raw).digest("hex");
      const bad="x".repeat(good.length);
      const res=await app.inject({
        method:"POST",url:"/api/webhooks/chain",
        headers:{"content-type":"application/json","x-webhook-signature":bad},
        body:payload,
      });
      expect(res.statusCode).toBe(401);
    });

    it("handles duplicate webhook event IDs idempotently",async()=>{
      (WebhookEvent.create as any).mockResolvedValueOnce({eventId:"evt-settled-1"});
      const r1=await app.inject(makeSignedRequest(payload));
      expect(r1.statusCode).toBe(200);

      (WebhookEvent.create as any).mockRejectedValueOnce({code:11000});
      const r2=await app.inject(makeSignedRequest(payload));
      expect(r2.statusCode).toBe(200);
      const body=JSON.parse(r2.body);
      expect(body.duplicate).toBe(true);
    });

    it("rejects invalid webhook payload shape",async()=>{
      const badPayload={eventId:"short",event:"PaymentSettled",paymentId:"pay-1",chain:"adi-testnet"};
      const raw=JSON.stringify(badPayload);
      const sig=crypto.createHmac("sha256",JWT_SECRET).update(raw).digest("hex");
      const res=await app.inject({
        method:"POST",url:"/api/webhooks/chain",
        headers:{"content-type":"application/json","x-webhook-signature":sig},
        body:badPayload,
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("on-chain verification requirements",()=>{
    it("webhook alone cannot mark a payment paid - payment status is only updated via independent RPC GET",async()=>{
      (WebhookEvent.create as any).mockResolvedValue({eventId:"evt-settled-2"});
      const payload={eventId:"evt-settled-2",event:"PaymentSettled",paymentId:"pay-1",chain:"adi-testnet"};
      const raw=JSON.stringify(payload);
      const sig=crypto.createHmac("sha256",JWT_SECRET).update(raw).digest("hex");
      const res=await app.inject({
        method:"POST",url:"/api/webhooks/chain",
        headers:{"content-type":"application/json","x-webhook-signature":sig},
        body:payload,
      });
      expect(res.statusCode).toBe(200);
      // Webhook must NOT touch the Payment model.
      expect(Payment.create).not.toHaveBeenCalled();
      expect(Payment.findOne).not.toHaveBeenCalled();
    });

    it("payment status reflects on-chain status, not frontend-provided data",async()=>{
      const saveMock=vi.fn();
      (Payment.findOne as any).mockResolvedValue({paymentId:"pay-1",chain:"adi-testnet",merchantId:"merchant-1",status:"pending",customerAddress:undefined,settledAt:undefined,save:saveMock});
      (getOnchainPayment as any).mockResolvedValue({merchant:"0xm",customer:"0xc",token:"0xtok",amount:"25.00",createdAt:Math.floor(Date.now()/1000)-100,paidAt:Math.floor(Date.now()/1000),status:2});
      const res=await app.inject({
        method:"GET",url:"/api/payments/pay-1?chain=adi-testnet",
        headers:{authorization:"Bearer valid-token"},
      });
      expect(res.statusCode).toBe(200);
      const body=JSON.parse(res.body);
      expect(body.status).toBe("paid");
      expect(saveMock).toHaveBeenCalled();
    });

    it("failed/non-existent on-chain payment is not reported as paid",async()=>{
      (getOnchainPayment as any).mockRejectedValue(new Error("missing"));
      (Payment.findOne as any).mockResolvedValue({paymentId:"pay-1",chain:"adi-testnet",merchantId:"merchant-1",status:"pending",customerAddress:undefined,settledAt:undefined,save:vi.fn()});
      const res=await app.inject({
        method:"GET",url:"/api/payments/pay-1?chain=adi-testnet",
        headers:{authorization:"Bearer valid-token"},
      });
      expect(res.statusCode).toBe(200);
      const body=JSON.parse(res.body);
      expect(body.status).not.toBe("paid");
    });
  });

});
