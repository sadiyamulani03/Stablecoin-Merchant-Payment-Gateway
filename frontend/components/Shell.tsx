"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { API_URL_CONFIGURED, DEPLOYMENT_ADDRESSES_MISSING } from "../lib/config";
import { useSession } from "./SessionProvider";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/payments/new", label: "New payment" },
  { href: "/history", label: "Payments" },
  { href: "/subscriptions", label: "Subscriptions" },
  { href: "/settings", label: "Settings" },
  { href: "/api-docs", label: "API docs" }
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session, isAuthenticated, signOut } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const misconfigured = !API_URL_CONFIGURED || DEPLOYMENT_ADDRESSES_MISSING;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="nav">
        <Link href="/" className="brand" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark" aria-hidden="true">
            M
          </span>
          mizan<span>pay</span>
        </Link>

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? "Close" : "Menu"}
        </button>

        <div id="primary-navigation" className={`nav-panel${menuOpen ? " open" : ""}`}>
          <nav className="navlinks" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="cluster" style={{ justifyContent: "flex-end" }}>
            {isAuthenticated ? (
              <>
                <span className="wallet-chip" title={session?.email || undefined}>
                  {session?.name || "Merchant"}
                </span>
                <button type="button" className="btn ghost sm" onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link className="btn secondary sm" href="/login">
                  Sign in
                </Link>
                <Link className="btn sm" href="/register">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {misconfigured ? (
        <div className="notice" style={{ margin: "16px 0 0" }}>
          {!API_URL_CONFIGURED
            ? "Backend API URL is not configured. Set NEXT_PUBLIC_API_URL in the Vercel project environment variables."
            : "Some contract addresses are not configured. Set the NEXT_PUBLIC_* address variables in the Vercel project environment variables."}
        </div>
      ) : null}

      <main className="main" id="main">
        {children}
      </main>

      <footer className="footer">
        <div className="cluster" style={{ justifyContent: "space-between" }}>
          <span>MizanPay · Testnet environment only · mDDSC is a mock token and has no real AED value.</span>
          <span className="muted-soft">ADI AB Testnet 99999 · Polygon Amoy 80002</span>
        </div>
      </footer>
    </div>
  );
}
