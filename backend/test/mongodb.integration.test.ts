import {describe,it,expect,beforeAll,afterAll,beforeEach,afterEach} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connect, connection, Types } from "mongoose";
import { Merchant,Payment,Subscription,WebhookEvent} from "../src/models/index.js";

let mongod:MongoMemoryServer;

beforeAll(async()=>{
  mongod=await MongoMemoryServer.create();
  const uri=mongod.getUri();
  await connect(uri);
});

afterAll(async()=>{
  await connection.dropDatabase();
  await connection.close();
  await mongod.stop();
});

beforeEach(async()=>{
  await Merchant.deleteMany({});
  await Payment.deleteMany({});
  await Subscription.deleteMany({});
  await WebhookEvent.deleteMany({});
});

afterEach(async()=>{
  await Merchant.deleteMany({});
  await Payment.deleteMany({});
  await Subscription.deleteMany({});
  await WebhookEvent.deleteMany({});
});

const merchantId1=new Types.ObjectId();
const merchantId2=new Types.ObjectId();

describe("MongoDB integration - Merchant model",()=>{
  it("creates and retrieves a merchant",async()=>{
    const merchant=await Merchant.create({
      name:"Test Merchant",
      tradeLicense:"TL-001",
      emirate:"Dubai",
      category:"Retail",
      walletAddress:"0xEDe9ca4BfA8e06A1fB832F2F19686b329863CEF0",
      email:"test@example.com",
      passwordHash:"hashedpassword",
    });
    expect(merchant._id).toBeDefined();
    expect(merchant.name).toBe("Test Merchant");
    expect(merchant.email).toBe("test@example.com");

    const found=await Merchant.findOne({email:"test@example.com"});
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Test Merchant");
  });

  it("enforces unique email",async()=>{
    await Merchant.create({
      name:"Test Merchant",
      tradeLicense:"TL-001",
      emirate:"Dubai",
      category:"Retail",
      walletAddress:"0xEDe9ca4BfA8e06A1fB832F2F19686b329863CEF0",
      email:"unique@example.com",
      passwordHash:"hashedpassword",
    });
    await expect(Merchant.create({
      name:"Test Merchant 2",
      tradeLicense:"TL-002",
      emirate:"Dubai",
      category:"Retail",
      walletAddress:"0x1234567890123456789012345678901234567890",
      email:"unique@example.com",
      passwordHash:"hashedpassword",
    })).rejects.toThrow();
  });

  it("excludes passwordHash from responses",async()=>{
    const merchant=await Merchant.create({
      name:"Test Merchant",
      tradeLicense:"TL-001",
      emirate:"Dubai",
      category:"Retail",
      walletAddress:"0xEDe9ca4BfA8e06A1fB832F2F19686b329863CEF0",
      email:"test2@example.com",
      passwordHash:"secretpassword",
    });
    const found=await Merchant.findById(merchant._id).select("-passwordHash");
    expect(found!.passwordHash).toBeUndefined();
  });
});

describe("MongoDB integration - Payment model",()=>{
  it("creates and retrieves a payment",async()=>{
    const payment=await Payment.create({
      paymentId:"0xpayment123",
      chain:"adi-testnet",
      merchantId:merchantId1,
      amount:"25.00",
      description:"Test payment",
      tokenAddress:"0x06289D9c452369abcb9bc1b5D6Adf80982C5679C",
      status:"pending",
      expiresAt:new Date(Date.now()+3600000),
    });
    expect(payment._id).toBeDefined();
    expect(payment.paymentId).toBe("0xpayment123");
    expect(payment.chain).toBe("adi-testnet");
    expect(payment.status).toBe("pending");

    const found=await Payment.findOne({paymentId:"0xpayment123",chain:"adi-testnet"});
    expect(found).not.toBeNull();
    expect(found!.amount).toBe("25.00");
  });

  it("enforces unique paymentId+chain index",async()=>{
    await Payment.create({
      paymentId:"unique-pay-1",
      chain:"adi-testnet",
      merchantId:merchantId1,
      amount:"25.00",
      tokenAddress:"0xtoken",
      status:"pending",
      expiresAt:new Date(Date.now()+3600000),
    });
    await expect(Payment.create({
      paymentId:"unique-pay-1",
      chain:"adi-testnet",
      merchantId:merchantId1,
      amount:"25.00",
      tokenAddress:"0xtoken",
      status:"pending",
      expiresAt:new Date(Date.now()+3600000),
    })).rejects.toThrow();
  });

  it("allows same paymentId on different chains",async()=>{
    await Payment.create({
      paymentId:"same-pay",
      chain:"adi-testnet",
      merchantId:merchantId1,
      amount:"25.00",
      tokenAddress:"0xtoken",
      status:"pending",
      expiresAt:new Date(Date.now()+3600000),
    });
    await Payment.create({
      paymentId:"same-pay",
      chain:"polygon-amoy",
      merchantId:merchantId1,
      amount:"25.00",
      tokenAddress:"0xtoken",
      status:"pending",
      expiresAt:new Date(Date.now()+3600000),
    });
    const count=await Payment.countDocuments({paymentId:"same-pay"});
    expect(count).toBe(2);
  });
});

describe("MongoDB integration - Subscription model",()=>{
  it("creates and retrieves a subscription",async()=>{
    const sub=await Subscription.create({
      subscriptionId:"sub-1",
      chain:"adi-testnet",
      merchantId:merchantId1,
      customerAddress:"0xEDe9ca4BfA8e06A1fB832F2F19686b329863CEF0",
      amountPerPeriod:"50.00",
      periodSeconds:2592000,
      nextChargeAt:new Date(Date.now()+2592000000),
      status:"active",
    });
    expect(sub._id).toBeDefined();
    expect(sub.subscriptionId).toBe("sub-1");

    const found=await Subscription.findOne({subscriptionId:"sub-1",chain:"adi-testnet"});
    expect(found).not.toBeNull();
    expect(found!.amountPerPeriod).toBe("50.00");
  });

  it("enforces unique subscriptionId+chain index",async()=>{
    await Subscription.create({
      subscriptionId:"unique-sub",
      chain:"adi-testnet",
      merchantId:merchantId1,
      customerAddress:"0xEDe9ca4BfA8e06A1fB832F2F19686b329863CEF0",
      amountPerPeriod:"50.00",
      periodSeconds:2592000,
      nextChargeAt:new Date(Date.now()+2592000000),
      status:"active",
    });
    await expect(Subscription.create({
      subscriptionId:"unique-sub",
      chain:"adi-testnet",
      merchantId:merchantId1,
      customerAddress:"0xEDe9ca4BfA8e06A1fB832F2F19686b329863CEF0",
      amountPerPeriod:"50.00",
      periodSeconds:2592000,
      nextChargeAt:new Date(Date.now()+2592000000),
      status:"active",
    })).rejects.toThrow();
  });
});

describe("MongoDB integration - WebhookEvent model",()=>{
  it("creates and retrieves a webhook event",async()=>{
    const event=await WebhookEvent.create({
      eventId:"evt-1",
      payloadHash:"sha256hash",
    });
    expect(event._id).toBeDefined();
    expect(event.eventId).toBe("evt-1");
    expect(event.payloadHash).toBe("sha256hash");

    const found=await WebhookEvent.findOne({eventId:"evt-1"});
    expect(found).not.toBeNull();
    expect(found!.payloadHash).toBe("sha256hash");
  });

  it("enforces unique eventId",async()=>{
    await WebhookEvent.create({
      eventId:"evt-unique",
      payloadHash:"hash1",
    });
    await expect(WebhookEvent.create({
      eventId:"evt-unique",
      payloadHash:"hash2",
    })).rejects.toThrow();
  });

  it("stores no sensitive fields",async()=>{
    const event=await WebhookEvent.create({
      eventId:"evt-sensitive",
      payloadHash:"hash",
    });
    const found=await WebhookEvent.findById(event._id);
    expect(found!.eventId).toBe("evt-sensitive");
    expect(found!.payloadHash).toBe("hash");
    expect(found!.rawPayload).toBeUndefined();
    expect(found!.secret).toBeUndefined();
    expect(found!.privateKey).toBeUndefined();
  });
});

describe("MongoDB integration - Merchant isolation",()=>{
  it("merchants can only access their own payments",async()=>{
    await Payment.create({
      paymentId:"pay-merchant1",
      chain:"adi-testnet",
      merchantId:merchantId1,
      amount:"25.00",
      tokenAddress:"0xtoken",
      status:"pending",
      expiresAt:new Date(Date.now()+3600000),
    });
    await Payment.create({
      paymentId:"pay-merchant2",
      chain:"adi-testnet",
      merchantId:merchantId2,
      amount:"50.00",
      tokenAddress:"0xtoken",
      status:"pending",
      expiresAt:new Date(Date.now()+3600000),
    });

    const merchant1Payments=await Payment.find({merchantId:merchantId1});
    const merchant2Payments=await Payment.find({merchantId:merchantId2});

    expect(merchant1Payments.length).toBe(1);
    expect(merchant2Payments.length).toBe(1);
    expect(merchant1Payments[0].paymentId).toBe("pay-merchant1");
    expect(merchant2Payments[0].paymentId).toBe("pay-merchant2");
  });
});
