import {describe,it,expect} from "vitest";
import {CHAINS,getChain} from "../src/config/chains.js";

describe("dual testnet configuration",()=>{
  it("defines ADI testnet with the expected chain id",()=>expect(CHAINS["adi-testnet"].chainId).toBe(99999));
  it("defines Polygon Amoy with the expected chain id",()=>expect(CHAINS["polygon-amoy"].chainId).toBe(80002));
  it("rejects unsupported networks",()=>expect(()=>getChain("polygon-mainnet")).toThrow());
});
