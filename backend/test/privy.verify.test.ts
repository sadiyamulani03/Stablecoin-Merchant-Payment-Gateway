import {describe,it,expect,vi,beforeEach,afterEach} from "vitest";
import type {FastifyInstance} from "fastify";
import Fastify from "fastify";
import {registerRoutes} from "../src/routes/api.js";

// ---- Mock @privy-io/node ----
const mocks = vi.hoisted(() => ({
  mockVerifyAccessToken: vi.fn(),
  mockVerifyIdentityToken: vi.fn(),
}));

vi.mock("@privy-io/node",()=>({
  verifyAccessToken: mocks.mockVerifyAccessToken,
  verifyIdentityToken: mocks.mockVerifyIdentityToken,
  InvalidAuthTokenError: class InvalidAuthTokenError extends Error {}
}));

// Import the mocked InvalidAuthTokenError for use in test assertions
import {InvalidAuthTokenError} from "@privy-io/node";

// ---- Mock jose (createRemoteJWKSet used at module load) ----
vi.mock("jose",()=>({
  createRemoteJWKSet: vi.fn(() => ({}))
}));

// ---- Mock fetch (used by createRemoteJWKSet for JWKS fetch) ----
const mockFetch = vi.fn();
beforeEach(()=>{
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
  mocks.mockVerifyAccessToken.mockReset();
  mocks.mockVerifyIdentityToken.mockReset();
  process.env.PRIVY_APP_ID = "test-app-id-12345";
  process.env.PRIVY_API_URL = "https://auth.privy.io";
});

afterEach(()=>{
  vi.restoreAllMocks();
  delete process.env.PRIVY_APP_ID;
  delete process.env.PRIVY_API_URL;
});

async function buildApp(): Promise<FastifyInstance>{
  const app=Fastify({logger:false});
  app.decorate("authenticate",async(_request:any,_reply:any)=>{});
  await registerRoutes(app);
  return app;
}

const validAccessToken = "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlzcyI6InByaXZ5LmlvIiwiYXVkIjoidGVzdC1hcHAtaWQtMTIzNDUiLCJleHAiOjk5OTk5OTk5OTl9.signature";
const validIdentityToken = "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlzcyI6InByaXZ5LmlvIiwiYXVkIjoidGVzdC1hcHAtaWQtMTIzNDUiLCJleHAiOjk5OTk5OTk5OTl9.signature";

const validIdentityPayload = {
  id: "user-123",
  linked_accounts: [
    {
      type: "wallet",
      wallet_client_type: "privy",
      connector_type: "embedded",
      address: "0x1234567890123456789012345678901234567890",
      chain_type: "ethereum"
    }
  ]
};

describe("POST /api/auth/privy/verify - Privy access token verification",()=>{

  it("returns 503 when Privy is not configured (no PRIVY_APP_ID)",async()=>{
    delete process.env.PRIVY_APP_ID;
    const app=await buildApp();
    const res=await app.inject({
      method:"POST",
      url:"/api/auth/privy/verify",
      payload:{idToken: validAccessToken, identityToken: validIdentityToken}
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({error:"Privy is not configured on the backend.",code:"PRIVY_NOT_CONFIGURED"});
  });

  it("returns 400 for missing idToken or identityToken",async()=>{
    const app=await buildApp();
    const res=await app.inject({
      method:"POST",
      url:"/api/auth/privy/verify",
      payload:{}
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({error:"Invalid request body"});
  });

  it("returns 401 for invalid access token signature",async()=>{
    mocks.mockVerifyAccessToken.mockRejectedValue(new InvalidAuthTokenError("Invalid signature"));
    const app=await buildApp();
    const res=await app.inject({
      method:"POST",
      url:"/api/auth/privy/verify",
      payload:{idToken: validAccessToken, identityToken: validIdentityToken}
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({error:"Invalid Privy access token.",code:"INVALID_PRIVY_TOKEN"});
  });

  it("returns 401 for incorrect issuer",async()=>{
    mocks.mockVerifyAccessToken.mockRejectedValue(new InvalidAuthTokenError("Invalid issuer"));
    const app=await buildApp();
    const res=await app.inject({
      method:"POST",
      url:"/api/auth/privy/verify",
      payload:{idToken: validAccessToken, identityToken: validIdentityToken}
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({code:"INVALID_PRIVY_TOKEN"});
  });

  it("returns 401 for incorrect audience",async()=>{
    mocks.mockVerifyAccessToken.mockRejectedValue(new InvalidAuthTokenError("Invalid audience"));
    const app=await buildApp();
    const res=await app.inject({
      method:"POST",
      url:"/api/auth/privy/verify",
      payload:{idToken: validAccessToken, identityToken: validIdentityToken}
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({code:"INVALID_PRIVY_TOKEN"});
  });

  it("returns 401 for expired token",async()=>{
    mocks.mockVerifyAccessToken.mockRejectedValue(new InvalidAuthTokenError("Token expired"));
    const app=await buildApp();
    const res=await app.inject({
      method:"POST",
      url:"/api/auth/privy/verify",
      payload:{idToken: validAccessToken, identityToken: validIdentityToken}
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({code:"INVALID_PRIVY_TOKEN"});
  });

  it("returns 401 for invalid identity token",async()=>{
    mocks.mockVerifyAccessToken.mockResolvedValue({user_id:"user-123"});
    mocks.mockVerifyIdentityToken.mockRejectedValue(new InvalidAuthTokenError("Invalid identity token"));
    const app=await buildApp();
    const res=await app.inject({
      method:"POST",
      url:"/api/auth/privy/verify",
      payload:{idToken: validAccessToken, identityToken: validIdentityToken}
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({code:"INVALID_PRIVY_IDENTITY_TOKEN"});
  });

  it("returns 401 when no embedded Ethereum wallet found",async()=>{
    mocks.mockVerifyAccessToken.mockResolvedValue({user_id:"user-123"});
    mocks.mockVerifyIdentityToken.mockResolvedValue({id:"user-123",linked_accounts:[]});
    const app=await buildApp();
    const res=await app.inject({
      method:"POST",
      url:"/api/auth/privy/verify",
      payload:{idToken: validAccessToken, identityToken: validIdentityToken}
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({code:"NO_EMBEDDED_WALLET"});
  });

  it("returns 401 when only external wallets exist",async()=>{
    mocks.mockVerifyAccessToken.mockResolvedValue({user_id:"user-123"});
    mocks.mockVerifyIdentityToken.mockResolvedValue({
      id:"user-123",
      linked_accounts:[
        {type:"wallet",wallet_client_type:"metamask",connector_type:"injected",chain_type:"ethereum",address:"0xabc"}
      ]
    });
    const app=await buildApp();
    const res=await app.inject({
      method:"POST",
      url:"/api/auth/privy/verify",
      payload:{idToken: validAccessToken, identityToken: validIdentityToken}
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({code:"NO_EMBEDDED_WALLET"});
  });

  it("returns verified wallet for successful verification",async()=>{
    mocks.mockVerifyAccessToken.mockResolvedValue({user_id:"user-123"});
    mocks.mockVerifyIdentityToken.mockResolvedValue(validIdentityPayload);
    const app=await buildApp();
    const res=await app.inject({
      method:"POST",
      url:"/api/auth/privy/verify",
      payload:{idToken: validAccessToken, identityToken: validIdentityToken}
    });
    expect(res.statusCode).toBe(200);
    const body=res.json();
    expect(body.userId).toBe("user-123");
    expect(body.walletAddress).toBe("0x1234567890123456789012345678901234567890");
    expect(body.walletChainType).toBe("ethereum");
    expect(body.walletType).toBe("wallet");
  });

  it("selects embedded wallet when multiple wallets exist",async()=>{
    mocks.mockVerifyAccessToken.mockResolvedValue({user_id:"user-123"});
    mocks.mockVerifyIdentityToken.mockResolvedValue({
      id:"user-123",
      linked_accounts:[
        {type:"wallet",wallet_client_type:"metamask",connector_type:"injected",chain_type:"ethereum",address:"0xexternal"},
        {type:"wallet",wallet_client_type:"privy",connector_type:"embedded",chain_type:"ethereum",address:"0xembedded"}
      ]
    });
    const app=await buildApp();
    const res=await app.inject({
      method:"POST",
      url:"/api/auth/privy/verify",
      payload:{idToken: validAccessToken, identityToken: validIdentityToken}
    });
    expect(res.statusCode).toBe(200);
    const body=res.json();
    expect(body.walletAddress).toBe("0xembedded");
  });

  it("calls verifyAccessToken with access token and appId",async()=>{
    mocks.mockVerifyAccessToken.mockResolvedValue({user_id:"user-123"});
    mocks.mockVerifyIdentityToken.mockResolvedValue(validIdentityPayload);
    const app=await buildApp();
    await app.inject({
      method:"POST",
      url:"/api/auth/privy/verify",
      payload:{idToken: validAccessToken, identityToken: validIdentityToken}
    });
    expect(mocks.mockVerifyAccessToken).toHaveBeenCalledWith({
      access_token: validAccessToken,
      app_id: "test-app-id-12345",
      verification_key: expect.anything()
    });
  });

  it("calls verifyIdentityToken with identity token and appId",async()=>{
    mocks.mockVerifyAccessToken.mockResolvedValue({user_id:"user-123"});
    mocks.mockVerifyIdentityToken.mockResolvedValue(validIdentityPayload);
    const app=await buildApp();
    await app.inject({
      method:"POST",
      url:"/api/auth/privy/verify",
      payload:{idToken: validAccessToken, identityToken: validIdentityToken}
    });
    expect(mocks.mockVerifyIdentityToken).toHaveBeenCalledWith({
      identity_token: validIdentityToken,
      app_id: "test-app-id-12345",
      verification_key: expect.anything()
    });
  });
});
