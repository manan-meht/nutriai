import Image from "next/image";
import Link from "next/link";

interface UnifiedHomeProps {
  familyHref: string;
  coachingHref: string;
}

export function UnifiedHome({ familyHref, coachingHref }: UnifiedHomeProps) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-6 py-6 flex items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center overflow-hidden">
          <Image src="/logos/logo-black.png" alt="" width={32} height={32} className="w-full h-full object-contain" />
        </div>
        <span className="font-bold text-gray-900 text-lg">Tistra Health</span>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-12">
        <div className="max-w-4xl w-full">
          <p className="text-gray-500 text-center mb-8">Choose where you&apos;d like to go.</p>

          <div className="grid sm:grid-cols-2 gap-6">
            <Link
              href={familyHref}
              className="group flex flex-col rounded-2xl border border-gray-200 overflow-hidden hover:border-rose-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
            >
              <div className="relative w-full h-40 sm:h-48">
                <Image
                  src="/landing/adults/immersive/hero/adults-hero.jpeg"
                  alt="An older Indian woman at home, photographing her meal"
                  fill
                  priority
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="object-cover object-center transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </div>
              <div className="flex flex-col flex-1 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-2">Care for your family</h2>
                <p className="text-gray-500 text-sm mb-6 flex-1">
                  Track nutrition, health information, meals, and progress for the people you care about.
                </p>
                <span className="inline-flex items-center justify-center rounded-xl bg-rose-600 group-hover:bg-rose-700 text-white font-semibold py-3 px-4 text-sm transition-colors">
                  Open Family View
                </span>
              </div>
            </Link>

            <Link
              href={coachingHref}
              className="group flex flex-col rounded-2xl border border-gray-200 overflow-hidden hover:border-purple-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2"
            >
              <div className="relative w-full h-40 sm:h-48">
                <Image
                  src="/landing/gym/immersive/hero/gym-hero.jpeg"
                  alt="Indian fitness client photographing his meal at the gym"
                  fill
                  priority
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="object-cover object-center transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </div>
              <div className="flex flex-col flex-1 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-2">Coach your clients</h2>
                <p className="text-gray-500 text-sm mb-6 flex-1">
                  Manage client nutrition, progress, plans, and coaching from one place.
                </p>
                <span className="inline-flex items-center justify-center rounded-xl bg-purple-600 group-hover:bg-purple-700 text-white font-semibold py-3 px-4 text-sm transition-colors">
                  Open Coaching View
                </span>
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
