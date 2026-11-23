import {describe,it,expect,beforeAll,afterAll,beforeEach} from "vitest";
import {prisma,connectDb,disconnectDb,isDbConnected} from "../src/lib/prisma.js";

const DATABASE_URL=process.env.DATABASE_URL;
const describeMySQL=DATABASE_URL ? describe : describe.skip;

describeMySQL("MySQL integration (Prisma)",()=>{
  beforeAll(async()=>{
    await connectDb();
  });

  afterAll(async()=>{
    if(isDbConnected()){
      await prisma.payment.deleteMany({});
      await prisma.subscription.deleteMany({});
      await prisma.webhookEvent.deleteMany({});
      await prisma.merchant.deleteMany({});
      await disconnectDb();
    }
  });

  beforeEach(async()=>{
    if(!isDbConnected())return;
    await prisma.payment.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.webhookEvent.deleteMany({});
    await prisma.merchant.deleteMany({});
  });

  it("connects to MySQL and reports connected",()=>{
    expect(isDbConnected()).toBe(true);
  });

  it("creates and retrieves a merchant",async()=>{
    if(!isDbConnected())return;
    const merchant=await prisma.merchant.create({
      data:{name:"Integration Merchant",tradeLicense:"TL-INT",emirate:"Dubai",category:"Retail",walletAddress:"0xEDe9ca4BfA8e06A1fB832F2F19686b329863CEF0",email:"int@example.com",passwordHash:"hash"},
    });
    expect(merchant.id).toBeDefined();
    const found=await prisma.merchant.findUnique({where:{email:"int@example.com"}});
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Integration Merchant");
  });

  it("enforces unique email",async()=>{
    if(!isDbConnected())return;
    await prisma.merchant.create({data:{name:"A",tradeLicense:"TL",emirate:"D",category:"C",walletAddress:"0xaaa",email:"uni@example.com",passwordHash:"h"}});
    await expect(prisma.merchant.create({data:{name:"B",tradeLicense:"TL2",emirate:"D",category:"C",walletAddress:"0xbbb",email:"uni@example.com",passwordHash:"h"}})).rejects.toMatchObject({code:"P2002"});
  });

  it("creates and retrieves a payment",async()=>{
    if(!isDbConnected())return;
    const merchant=await prisma.merchant.create({data:{name:"P",tradeLicense:"TL",emirate:"D",category:"C",walletAddress:"0xaaa",email:"pay@example.com",passwordHash:"h"}});
    const payment=await prisma.payment.create({data:{paymentId:"int-pay-1",chain:"adi-testnet",merchantId:merchant.id,amount:"25.00",tokenAddress:"0xtoken",status:"pending",expiresAt:new Date(Date.now()+3600000)}});
    expect(payment.paymentId).toBe("int-pay-1");
    const found=await prisma.payment.findUnique({where:{paymentId_chain:{paymentId:"int-pay-1",chain:"adi-testnet"}}});
    expect(found).not.toBeNull();
    expect(found!.amount).toBe("25.00");
  });

  it("rejects duplicate paymentId+chain",async()=>{
    if(!isDbConnected())return;
    const merchant=await prisma.merchant.create({data:{name:"D",tradeLicense:"TL",emirate:"D",category:"C",walletAddress:"0xaaa",email:"dup@example.com",passwordHash:"h"}});
    await prisma.payment.create({data:{paymentId:"dup-pay",chain:"adi-testnet",merchantId:merchant.id,amount:"1.00",tokenAddress:"0x",status:"pending",expiresAt:new Date()}});
    await expect(prisma.payment.create({data:{paymentId:"dup-pay",chain:"adi-testnet",merchantId:merchant.id,amount:"1.00",tokenAddress:"0x",status:"pending",expiresAt:new Date()}})).rejects.toMatchObject({code:"P2002"});
  });

  it("allows same paymentId on different chains",async()=>{
    if(!isDbConnected())return;
    const merchant=await prisma.merchant.create({data:{name:"M",tradeLicense:"TL",emirate:"D",category:"C",walletAddress:"0xaaa",email:"chain@example.com",passwordHash:"h"}});
    await prisma.payment.create({data:{paymentId:"same-pay",chain:"adi-testnet",merchantId:merchant.id,amount:"1.00",tokenAddress:"0x",status:"pending",expiresAt:new Date()}});
    await prisma.payment.create({data:{paymentId:"same-pay",chain:"polygon-amoy",merchantId:merchant.id,amount:"1.00",tokenAddress:"0x",status:"pending",expiresAt:new Date()}});
    const count=await prisma.payment.count({where:{paymentId:"same-pay"}});
    expect(count).toBe(2);
  });

  it("creates and retrieves a subscription",async()=>{
    if(!isDbConnected())return;
    const merchant=await prisma.merchant.create({data:{name:"S",tradeLicense:"TL",emirate:"D",category:"C",walletAddress:"0xaaa",email:"sub@example.com",passwordHash:"h"}});
    const sub=await prisma.subscription.create({data:{subscriptionId:"int-sub-1",chain:"adi-testnet",merchantId:merchant.id,customerAddress:"0xc",amountPerPeriod:"50.00",periodSeconds:2592000,nextChargeAt:new Date(Date.now()+2592000000),status:"active"}});
    expect(sub.subscriptionId).toBe("int-sub-1");
    const found=await prisma.subscription.findUnique({where:{subscriptionId_chain:{subscriptionId:"int-sub-1",chain:"adi-testnet"}}});
    expect(found).not.toBeNull();
  });

  it("enforces unique subscriptionId+chain",async()=>{
    if(!isDbConnected())return;
    const merchant=await prisma.merchant.create({data:{name:"U",tradeLicense:"TL",emirate:"D",category:"C",walletAddress:"0xaaa",email:"usub@example.com",passwordHash:"h"}});
    await prisma.subscription.create({data:{subscriptionId:"uni-sub",chain:"adi-testnet",merchantId:merchant.id,customerAddress:"0xc",amountPerPeriod:"1.00",periodSeconds:3600,nextChargeAt:new Date(),status:"active"}});
    await expect(prisma.subscription.create({data:{subscriptionId:"uni-sub",chain:"adi-testnet",merchantId:merchant.id,customerAddress:"0xc",amountPerPeriod:"1.00",periodSeconds:3600,nextChargeAt:new Date(),status:"active"}})).rejects.toMatchObject({code:"P2002"});
  });

  it("creates and rejects duplicate webhook eventId",async()=>{
    if(!isDbConnected())return;
    await prisma.webhookEvent.create({data:{eventId:"evt-int-1",payloadHash:"hash1"}});
    await expect(prisma.webhookEvent.create({data:{eventId:"evt-int-1",payloadHash:"hash2"}})).rejects.toMatchObject({code:"P2002"});
  });

  it("merchant isolation - merchants see only their own payments",async()=>{
    if(!isDbConnected())return;
    const m1=await prisma.merchant.create({data:{name:"M1",tradeLicense:"TL",emirate:"D",category:"C",walletAddress:"0xaaa",email:"m1@example.com",passwordHash:"h"}});
    const m2=await prisma.merchant.create({data:{name:"M2",tradeLicense:"TL",emirate:"D",category:"C",walletAddress:"0xbbb",email:"m2@example.com",passwordHash:"h"}});
    await prisma.payment.create({data:{paymentId:"iso-1",chain:"adi-testnet",merchantId:m1.id,amount:"25.00",tokenAddress:"0x",status:"pending",expiresAt:new Date()}});
    await prisma.payment.create({data:{paymentId:"iso-2",chain:"adi-testnet",merchantId:m2.id,amount:"50.00",tokenAddress:"0x",status:"pending",expiresAt:new Date()}});
    const c1=await prisma.payment.count({where:{merchantId:m1.id}});
    const c2=await prisma.payment.count({where:{merchantId:m2.id}});
    expect(c1).toBe(1);
    expect(c2).toBe(1);
  });

  it("analytics summary for a merchant",async()=>{
    if(!isDbConnected())return;
    const merchant=await prisma.merchant.create({data:{name:"An",tradeLicense:"TL",emirate:"D",category:"C",walletAddress:"0xaaa",email:"an@example.com",passwordHash:"h"}});
    await prisma.payment.create({data:{paymentId:"an-1",chain:"adi-testnet",merchantId:merchant.id,amount:"25.00",tokenAddress:"0x",status:"paid",expiresAt:new Date()}});
    await prisma.payment.create({data:{paymentId:"an-2",chain:"adi-testnet",merchantId:merchant.id,amount:"50.00",tokenAddress:"0x",status:"paid",expiresAt:new Date()}});
    const paid=await prisma.payment.findMany({where:{merchantId:merchant.id,status:"paid"}});
    const volume=paid.reduce((sum,p)=>sum+Number(p.amount),0);
    expect(paid.length).toBe(2);
    expect(volume).toBe(75);
  });

  it("database transaction handling",async()=>{
    if(!isDbConnected())return;
    const merchant=await prisma.merchant.create({data:{name:"Tx",tradeLicense:"TL",emirate:"D",category:"C",walletAddress:"0xaaa",email:"tx@example.com",passwordHash:"h"}});
    await prisma.$transaction(async(tx)=>{
      await tx.payment.create({data:{paymentId:"tx-pay",chain:"adi-testnet",merchantId:merchant.id,amount:"1.00",tokenAddress:"0x",status:"pending",expiresAt:new Date()}});
      await tx.payment.update({where:{paymentId_chain:{paymentId:"tx-pay",chain:"adi-testnet"}},data:{status:"paid"}});
    });
    const found=await prisma.payment.findUnique({where:{paymentId_chain:{paymentId:"tx-pay",chain:"adi-testnet"}}});
    expect(found!.status).toBe("paid");
  });
});
