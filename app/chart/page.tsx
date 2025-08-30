"use client";

import dynamic from "next/dynamic";
import Footer from "@/components/Footer";

const WaitsChart = dynamic(() => import("@/components/WaitsChart"), { ssr: false });

export default function ChartPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="container-p py-6 flex-1 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Grafico attese nel tempo</h2>
        </div>

        <WaitsChart />
      </main>
      <Footer />
    </div>
  );
}
