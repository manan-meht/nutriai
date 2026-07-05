import Image from "next/image";
import Link from "next/link";

// Shared sticky top nav for every marketing page (/, /family, /coach, /me)
// so the menu stays steady on scroll across the whole marketing surface,
// not just the master homepage. Purely presentational — each page keeps
// its own hero/content below it.
export function MarketingHeader() {
  return (
    <header className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
            <Image src="/logos/logo-purple.png" alt="" width={32} height={32} className="w-full h-full object-contain" />
          </div>
          <span className="font-bold text-gray-900">Tistra Health</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          <Link href="/#how-it-works" className="text-gray-600 hover:text-[#4F378A]">How it works</Link>
          <Link href="/family" className="text-gray-600 hover:text-[#4F378A]">Family</Link>
          <Link href="/coach" className="text-gray-600 hover:text-[#4F378A]">Coach</Link>
          <Link href="/me" className="text-gray-600 hover:text-[#4F378A]">Track Myself</Link>
          <Link href="/login" className="text-gray-600 hover:text-[#4F378A]">Login</Link>
        </nav>
        <Link
          href="/#pick-product"
          className="bg-[#6750A4] hover:bg-[#4F378A] text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-colors"
        >
          Get Started
        </Link>
      </div>
    </header>
  );
}
