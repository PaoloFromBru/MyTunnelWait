export default function Footer() {
  return (
    <footer className="border-t bg-white">
      <div className="container-p py-6 text-xs text-gray-600 flex items-center justify-between">
        <span>© {new Date().getFullYear()} My Tunnel Wait</span>
        <span>v0.1.0</span>
      </div>
    </footer>
  );
}
