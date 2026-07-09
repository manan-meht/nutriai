import { Reveal } from "@/components/motion/Reveal";

interface DashboardPreviewBlockProps {
  heading: string;
  lines: string[];
  className?: string;
}

/** Reusable "weekly summary" style preview card — shows what the
 * dashboard/summary side of the product looks like, paired with
 * WhatsAppDemoBlock to make the full photo -> estimate -> confirm ->
 * insights loop visible on every page. */
export function DashboardPreviewBlock({ heading, lines, className }: DashboardPreviewBlockProps) {
  return (
    <Reveal delay={100}>
      <div className={`bg-white border border-gray-200 rounded-2xl p-5 max-w-md mx-auto shadow-sm ${className ?? ""}`}>
        <p className="text-xs font-semibold text-[#4F378A] uppercase tracking-widest mb-3">{heading}</p>
        <ul className="space-y-2">
          {lines.map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="text-[#6750A4] flex-shrink-0">•</span>
              {line}
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}
