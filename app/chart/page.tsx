"use client";

import dynamic from "next/dynamic";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";

const WaitsChart = dynamic(() => import("@/components/WaitsChart"), { ssr: false });

export default function ChartPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="container-p py-6 flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Grafico attese nel tempo</h2>
          <Link
            href="/"
            className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
          >
            ← Torna alla lista
          </Link>
        </div>

        <WaitsChart />
      </main>
      <Footer />
    </div>
  );
}
