import {describe,it,expect} from "vitest";
import {NETWORKS,getChain} from "../lib/config";

describe("frontend dual testnet configuration",()=>{
  it("defines ADI testnet with the expected chain id",()=>expect(NETWORKS["adi-testnet"].chainId).toBe(99999));
  it("defines Polygon Amoy with the expected chain id",()=>expect(NETWORKS["polygon-amoy"].chainId).toBe(80002));
  it("selects polygon-amoy when requested",()=>expect(getChain("polygon-amoy")).toBe("polygon-amoy"));
  it("defaults to ADI testnet for empty or unknown chain",()=>{expect(getChain(null)).toBe("adi-testnet");expect(getChain("")).toBe("adi-testnet");expect(getChain("mainnet")).toBe("adi-testnet");});
  it("exposes the correct RPC URLs",()=>{
    expect(NETWORKS["adi-testnet"].rpc).toBe("https://rpc.ab.testnet.adifoundation.ai/");
    expect(NETWORKS["polygon-amoy"].rpc).toBe("https://rpc-amoy.polygon.technology/");
  });
});
