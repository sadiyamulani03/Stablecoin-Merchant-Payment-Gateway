import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "../components/SessionProvider";
import { PrivyProviderWrapper } from "../components/PrivyProviderWrapper";

export const metadata: Metadata = {
  title: "MizanPay — Stablecoin Merchant Gateway",
  description:
    "Testnet payment gateway for merchants: create payment requests, settle in mock mDDSC on ADI AB Testnet and Polygon Amoy, and reconcile on-chain state.",
  applicationName: "MizanPay",
  formatDetection: { telephone: false }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PrivyProviderWrapper>
          <SessionProvider>{children}</SessionProvider>
        </PrivyProviderWrapper>
      </body>
    </html>
  );
}
