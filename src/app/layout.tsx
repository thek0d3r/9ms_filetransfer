import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import "@fontsource-variable/archivo";
import "@fontsource/unbounded/400.css";
import "@fontsource/unbounded/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "9ms — Send it now", template: "%s · 9ms" },
  description: "Private, temporary file transfers without the waiting room.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const account = await currentUser();
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link className="wordmark" href="/" aria-label="9ms home"><span>9</span>ms</Link>
          <div className="header-status"><i aria-hidden="true" /> encrypted in transit</div>
          <nav aria-label="Primary navigation">
            <Link href="/password">Passwords</Link>
            <Link href="/pricing">Premium</Link>
            {account ? <Link href="/account">Account</Link> : <Link href="/login">Sign in</Link>}
            {account?.user.role === "admin" && <Link href="/admin">Admin</Link>}
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
