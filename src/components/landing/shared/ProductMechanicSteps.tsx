import { Reveal } from "@/components/motion/Reveal";

export interface MechanicStep {
  title: string;
  description: string;
}

interface ProductMechanicStepsProps {
  eyebrow?: string;
  heading: string;
  steps: MechanicStep[];
  className?: string;
}

/** The repeated "send a photo -> estimate -> confirm -> insights" mechanic
 * that should appear near the top of every marketing page so the product
 * is explained in seconds, not just implied through emotional copy. */
export function ProductMechanicSteps({ eyebrow, heading, steps, className }: ProductMechanicStepsProps) {
  return (
    <section className={`py-16 px-6 ${className ?? ""}`}>
      <div className="max-w-4xl mx-auto">
        {eyebrow && (
          <Reveal>
            <p className="text-xs font-semibold text-[#6750A4] uppercase tracking-widest mb-3 text-center">{eyebrow}</p>
          </Reveal>
        )}
        <Reveal delay={eyebrow ? 100 : 0}>
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">{heading}</h2>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 80}>
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#6750A4] text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </div>
                <p className="font-semibold text-gray-900 text-sm">{step.title}</p>
                <p className="text-gray-600 text-xs leading-relaxed">{step.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
