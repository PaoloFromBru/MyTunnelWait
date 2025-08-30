"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function Header() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
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
        {/* Desktop nav */}
        <nav className="text-sm hidden md:flex gap-3">
          <Link href="/" className={linkCls("/")} aria-current={isActive("/") ? "page" : undefined}>Home</Link>
          <Link href="/log" className={linkCls("/log")} aria-current={isActive("/log") ? "page" : undefined}>Log</Link>
          <Link href="/chart" className={linkCls("/chart")} aria-current={isActive("/chart") ? "page" : undefined}>Grafico</Link>
          <Link href="/plan" className={linkCls("/plan")} aria-current={isActive("/plan") ? "page" : undefined}>Plan</Link>
          <Link href="/history" className={linkCls("/history")} aria-current={isActive("/history") ? "page" : undefined}>Storico</Link>
          <Link href="/sources" className={linkCls("/sources")} aria-current={isActive("/sources") ? "page" : undefined}>Online</Link>
        </nav>
        {/* Mobile menu button */}
        <button
          className="md:hidden inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm"
          aria-label="Apri menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {open ? (
              <path d="M18 6L6 18M6 6l12 12" />
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>
      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t bg-white">
          <nav className="container-p py-2 flex flex-col text-sm">
            <Link href="/" className={`py-2 ${linkCls("/")}`} onClick={() => setOpen(false)}>Home</Link>
            <Link href="/log" className={`py-2 ${linkCls("/log")}`} onClick={() => setOpen(false)}>Log</Link>
            <Link href="/chart" className={`py-2 ${linkCls("/chart")}`} onClick={() => setOpen(false)}>Grafico</Link>
            <Link href="/plan" className={`py-2 ${linkCls("/plan")}`} onClick={() => setOpen(false)}>Plan</Link>
            <Link href="/history" className={`py-2 ${linkCls("/history")}`} onClick={() => setOpen(false)}>Storico</Link>
            <Link href="/sources" className={`py-2 ${linkCls("/sources")}`} onClick={() => setOpen(false)}>Online</Link>
          </nav>
        </div>
      )}
    </header>
  );
}
