"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function Header() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [anim, setAnim] = useState(false);
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const linkCls = (href: string) =>
    `hover:underline ${isActive(href) ? "text-black font-semibold" : "text-gray-700"}`;

  // Lock scroll when mobile menu is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = prev || "";
    return () => { document.body.style.overflow = prev || ""; };
  }, [open]);

  // trigger enter animation on open
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setAnim(true));
      return () => cancelAnimationFrame(id);
    } else {
      setAnim(false);
    }
  }, [open]);

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
          <Link
            href="/airplane-mode"
            className={linkCls("/airplane-mode")}
            aria-current={isActive("/airplane-mode") ? "page" : undefined}
          >
            Modalità aereo
          </Link>
          <Link href="/history" className={linkCls("/history")} aria-current={isActive("/history") ? "page" : undefined}>Storico</Link>
          <Link href="/sources" className={linkCls("/sources")} aria-current={isActive("/sources") ? "page" : undefined}>Online</Link>
        </nav>
        {/* Mobile menu button */}
        <button
          className="md:hidden inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm"
          aria-label={open ? "Chiudi menu" : "Apri menu"}
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
      {/* Mobile full-screen overlay */}
      {open && (
        <div
          className={`fixed inset-0 z-[60] md:hidden transition-opacity duration-200 ${anim ? 'opacity-100' : 'opacity-0'}`}
          aria-hidden={!open}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className={`relative h-full bg-white/95 backdrop-blur-sm transition-transform duration-200 ease-out ${anim ? 'translate-y-0' : 'translate-y-2'}`} onClick={(e)=>e.stopPropagation()}>
            <div className="container-p flex items-center justify-between py-3">
              <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
                <Image src="/icons/icon-192.png" alt="My Tunnel Wait" width={28} height={28} />
                <span className="text-base font-semibold tracking-tight">My Tunnel Wait</span>
              </Link>
              <button
                className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm"
                aria-label="Chiudi menu"
                onClick={() => setOpen(false)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="container-p mt-6 flex-1 flex flex-col gap-4 text-xl items-end text-right pr-4">
              <Link href="/" className={linkCls("/")} onClick={() => setOpen(false)}>Home</Link>
              <Link href="/log" className={linkCls("/log")} onClick={() => setOpen(false)}>Log</Link>
              <Link href="/chart" className={linkCls("/chart")} onClick={() => setOpen(false)}>Grafico</Link>
              <Link href="/plan" className={linkCls("/plan")} onClick={() => setOpen(false)}>Plan</Link>
              <Link href="/airplane-mode" className={linkCls("/airplane-mode")} onClick={() => setOpen(false)}>
                Modalità aereo
              </Link>
              <Link href="/history" className={linkCls("/history")} onClick={() => setOpen(false)}>Storico</Link>
              <Link href="/sources" className={linkCls("/sources")} onClick={() => setOpen(false)}>Online</Link>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
