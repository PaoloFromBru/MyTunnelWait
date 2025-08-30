"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname() || "/";
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const linkCls = (href: string) =>
    `hover:underline ${isActive(href) ? "text-black font-semibold" : "text-gray-700"}`;

  return (
    <header className="border-b bg-white sticky top-0 z-50">
      <div className="container-p py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/icons/icon-192.png"
            alt="Logo My Tunnel Wait"
            width={32}
            height={32}
            priority
          />
          <span className="text-lg font-semibold tracking-tight">My Tunnel Wait</span>
        </Link>
        <nav className="text-sm flex gap-3">
          <Link href="/" className={linkCls("/")} aria-current={isActive("/") ? "page" : undefined}>Home</Link>
          <Link href="/log" className={linkCls("/log")} aria-current={isActive("/log") ? "page" : undefined}>Log</Link>
          <Link href="/chart" className={linkCls("/chart")} aria-current={isActive("/chart") ? "page" : undefined}>Grafico</Link>
          <Link href="/plan" className={linkCls("/plan")} aria-current={isActive("/plan") ? "page" : undefined}>Plan</Link>
          <Link href="/history" className={linkCls("/history")} aria-current={isActive("/history") ? "page" : undefined}>Storico</Link>
          <Link href="/sources" className={linkCls("/sources")} aria-current={isActive("/sources") ? "page" : undefined}>Online</Link>
        </nav>
      </div>
    </header>
  );
}
