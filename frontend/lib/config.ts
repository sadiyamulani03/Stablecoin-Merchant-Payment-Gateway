const configuredApiUrl=(process.env.NEXT_PUBLIC_API_URL||"").trim();
export const API_URL=configuredApiUrl?configuredApiUrl.replace(/\/+$/,""):(process.env.NODE_ENV==="production"?"":"http://localhost:4000");
export const API_URL_CONFIGURED=API_URL.length>0;
export const NETWORKS={
  "adi-testnet":{name:"ADI Network AB Testnet",chainId:99999,chainHex:"0x1869f",rpc:"https://rpc.ab.testnet.adifoundation.ai/",explorer:"https://explorer.ab.testnet.adifoundation.ai/",currency:"ADI"},
  "polygon-amoy":{name:"Polygon Amoy",chainId:80002,chainHex:"0x13882",rpc:"https://rpc-amoy.polygon.technology/",explorer:"https://amoy.polygonscan.com/",currency:"POL"}
} as const;
export type ChainKey=keyof typeof NETWORKS;
export function getChain(search:string|null):ChainKey{return search==="polygon-amoy"?"polygon-amoy":"adi-testnet";}
export const ROUTER_ABI=["function pay(bytes32 paymentId,address token)"];
export const TOKEN_ABI=["function approve(address spender,uint256 amount) returns (bool)","function decimals() view returns (uint8)"];
export const DEPLOYMENTS={
  "adi-testnet":{token:process.env.NEXT_PUBLIC_ADI_TOKEN_ADDRESS||"",router:process.env.NEXT_PUBLIC_ADI_ROUTER_ADDRESS||"",subscriptions:process.env.NEXT_PUBLIC_ADI_SUBSCRIPTION_MANAGER_ADDRESS||""},
  "polygon-amoy":{token:process.env.NEXT_PUBLIC_POLYGON_TOKEN_ADDRESS||"",router:process.env.NEXT_PUBLIC_POLYGON_ROUTER_ADDRESS||"",subscriptions:process.env.NEXT_PUBLIC_POLYGON_SUBSCRIPTION_MANAGER_ADDRESS||""}
} as const;
export const DEPLOYMENT_ADDRESSES_MISSING=(Object.values(DEPLOYMENTS) as readonly {token:string;router:string;subscriptions:string}[]).some(d=>!d.token||!d.router||!d.subscriptions);
