import type {Metadata} from "next";
import "./globals.css";
export const metadata:Metadata={title:"MizanPay — Stablecoin Merchant Gateway",description:"Testnet payment gateway for merchant stablecoin payments."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
