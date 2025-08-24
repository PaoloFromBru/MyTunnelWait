export default function Header() {
  return (
    <header className="border-b bg-white sticky top-0 z-10">
      <div className="container-p py-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          My Tunnel Wait
        </h1>
        <nav className="text-sm text-gray-600 flex gap-3">
          <a href="/" className="hover:underline">Home</a>
          <a href="/log" className="hover:underline">Log</a>
          <a href="/chart" className="hover:underline">Grafico</a>
          <a href="/plan" className="hover:underline">Plan</a>
          <a href="/history" className="hover:underline">Storico</a>
        </nav>
      </div>
    </header>
  );
}
