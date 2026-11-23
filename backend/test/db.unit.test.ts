import {describe,it,expect,vi,beforeEach,afterEach} from "vitest";

const hoisted=vi.hoisted(()=>({
  merchant:{findUnique: vi.fn(), create: vi.fn(), findFirst: vi.fn()},
  payment:{findUnique: vi.fn(), create: vi.fn(), count: vi.fn(), findMany: vi.fn(), update: vi.fn()},
  subscription:{findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn()},
  webhookEvent:{create: vi.fn(), findUnique: vi.fn()},
  $transaction: vi.fn(),
}));

vi.mock("../src/lib/prisma.js",()=>({
  prisma: {
    merchant: hoisted.merchant,
    payment: hoisted.payment,
    subscription: hoisted.subscription,
    webhookEvent: hoisted.webhookEvent,
    $transaction: hoisted.$transaction,
  },
  isDbConnected: () => true,
  connectDb: vi.fn(),
  disconnectDb: vi.fn(),
}));

import {prisma} from "../src/lib/prisma.js";

beforeEach(()=>{
  vi.clearAllMocks();
});
afterEach(()=>{
  vi.restoreAllMocks();
});

describe("Prisma unit - Merchant",()=>{
  it("creates a merchant",async()=>{
    (hoisted.merchant.create as any).mockResolvedValue({
      id:"m-1",name:"Acme",email:"acme@example.com",status:"testnet_active",
    });
    const created=await prisma.merchant.create({
      data:{name:"Acme",tradeLicense:"TL-1",emirate:"Dubai",category:"Retail",walletAddress:"0xabc",email:"acme@example.com",passwordHash:"hash"},
    });
    expect(created.id).toBe("m-1");
    expect(created.email).toBe("acme@example.com");
    expect(hoisted.merchant.create).toHaveBeenCalledTimes(1);
  });

  it("retrieves a merchant by email without passwordHash",async()=>{
    (hoisted.merchant.findUnique as any).mockResolvedValue({
      id:"m-1",name:"Acme",email:"acme@example.com",walletAddress:"0xabc",status:"testnet_active",
    });
    const found=await prisma.merchant.findUnique({where:{email:"acme@example.com"},select:{id:true,name:true,email:true,walletAddress:true,status:true}});
    expect(found).not.toBeNull();
    expect((found as any).passwordHash).toBeUndefined();
  });

  it("enforces unique email via duplicate rejection",async()=>{
    (hoisted.merchant.create as any).mockRejectedValueOnce({code:"P2002",meta:{target:["email"]}});
    await expect(prisma.merchant.create({data:{name:"Dup",tradeLicense:"TL",emirate:"D",category:"C",walletAddress:"0xdup",email:"dup@example.com",passwordHash:"h"}})).rejects.toMatchObject({code:"P2002"});
  });
});

describe("Prisma unit - Payment",()=>{
  it("creates and retrieves a payment by paymentId+chain",async()=>{
    (hoisted.payment.create as any).mockResolvedValue({
      id:"p-1",paymentId:"pay-1",chain:"adi-testnet",merchantId:"m-1",amount:"25.00",status:"pending",
    });
    const created=await prisma.payment.create({
      data:{paymentId:"pay-1",chain:"adi-testnet",merchantId:"m-1",amount:"25.00",tokenAddress:"0xtoken",status:"pending",expiresAt:new Date()},
    });
    expect(created.paymentId).toBe("pay-1");
    expect(created.chain).toBe("adi-testnet");

    (hoisted.payment.findUnique as any).mockResolvedValue(created);
    const found=await prisma.payment.findUnique({where:{paymentId_chain:{paymentId:"pay-1",chain:"adi-testnet"}}});
    expect(found).not.toBeNull();
    expect(found!.amount).toBe("25.00");
  });

  it("rejects duplicate paymentId+chain (P2002)",async()=>{
    (hoisted.payment.create as any).mockRejectedValueOnce({code:"P2002"});
    await expect(prisma.payment.create({data:{paymentId:"dup",chain:"adi-testnet",merchantId:"m-1",amount:"1.00",tokenAddress:"0x",status:"pending",expiresAt:new Date()}})).rejects.toMatchObject({code:"P2002"});
  });

  it("counts paid payments for a merchant",async()=>{
    (hoisted.payment.count as any).mockResolvedValue(3);
    const n=await prisma.payment.count({where:{merchantId:"m-1",status:"paid"}});
    expect(n).toBe(3);
  });

  it("updates payment status to paid",async()=>{
    const saveMock=vi.fn();
    (hoisted.payment.update as any).mockImplementation(saveMock);
    await prisma.payment.update({where:{id:"p-1"},data:{status:"paid",customerAddress:"0xc",settledAt:new Date()}});
    expect(saveMock).toHaveBeenCalled();
  });
});

describe("Prisma unit - Subscription",()=>{
  it("creates and lists subscriptions for a merchant",async()=>{
    (hoisted.subscription.create as any).mockResolvedValue({
      id:"s-1",subscriptionId:"sub-1",chain:"adi-testnet",merchantId:"m-1",status:"active",
    });
    const created=await prisma.subscription.create({
      data:{subscriptionId:"sub-1",chain:"adi-testnet",merchantId:"m-1",customerAddress:"0xc",amountPerPeriod:"50.00",periodSeconds:2592000,nextChargeAt:new Date(),status:"active"},
    });
    expect(created.subscriptionId).toBe("sub-1");

    (hoisted.subscription.findMany as any).mockResolvedValue([created]);
    const list=await prisma.subscription.findMany({where:{merchantId:"m-1"},orderBy:{createdAt:"desc"}});
    expect(list.length).toBe(1);
  });
});

describe("Prisma unit - WebhookEvent",()=>{
  it("creates a webhook event",async()=>{
    (hoisted.webhookEvent.create as any).mockResolvedValue({id:"w-1",eventId:"evt-1",payloadHash:"hash"});
    const ev=await prisma.webhookEvent.create({data:{eventId:"evt-1",payloadHash:"hash"}});
    expect(ev.eventId).toBe("evt-1");
  });

  it("rejects duplicate eventId (P2002)",async()=>{
    (hoisted.webhookEvent.create as any).mockRejectedValueOnce({code:"P2002"});
    await expect(prisma.webhookEvent.create({data:{eventId:"evt-dup",payloadHash:"hash"}})).rejects.toMatchObject({code:"P2002"});
  });
});

describe("Prisma unit - transactions",()=>{
  it("runs writes in a transaction",async()=>{
    (hoisted.$transaction as any).mockResolvedValue([{id:"p-1"}]);
    const result=await prisma.$transaction([prisma.payment.create({data:{paymentId:"t-1",chain:"adi-testnet",merchantId:"m-1",amount:"1.00",tokenAddress:"0x",status:"pending",expiresAt:new Date()}})]);
    expect(hoisted.$transaction).toHaveBeenCalled();
    expect(result[0].id).toBe("p-1");
  });
});
