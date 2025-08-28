import Link from "next/link";

export default function Header() {
  return (
    <header className="border-b bg-white sticky top-0 z-10">
      <div className="container-p py-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          My Tunnel Wait
        </h1>
        <nav className="text-sm text-gray-600 flex gap-3">
          <Link href="/" className="hover:underline">Home</Link>
          <Link href="/log" className="hover:underline">Log</Link>
          <Link href="/chart" className="hover:underline">Grafico</Link>
          <Link href="/plan" className="hover:underline">Plan</Link>
          <Link href="/history" className="hover:underline">Storico</Link>
        </nav>
      </div>
    </header>
  );
}
