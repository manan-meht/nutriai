import { Reveal } from "@/components/motion/Reveal";

interface WhatsAppDemoBlockProps {
  senderLine: string;
  reply: string;
  confirmLine?: string;
  confirmReply?: string;
  className?: string;
}

/** Reusable WhatsApp chat mockup showing the "meal photo -> Tistra estimate"
 * exchange. Used across the homepage and every family/coach/me page (global
 * and India variants) so the product mechanic is always shown, not just
 * described. */
export function WhatsAppDemoBlock({ senderLine, reply, confirmLine, confirmReply, className }: WhatsAppDemoBlockProps) {
  return (
    <Reveal>
      <div className={`bg-gray-50 rounded-2xl p-4 flex flex-col gap-3 border border-gray-100 max-w-md mx-auto ${className ?? ""}`}>
        <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
          <div className="w-6 h-6 rounded-full bg-[#6750A4] flex items-center justify-center text-white text-xs font-bold">T</div>
          <span className="text-sm font-medium text-[#4F378A]">Tistra Assistant</span>
        </div>
        <div className="self-end max-w-[85%] bg-green-100 rounded-2xl rounded-tr-none p-3">
          <p className="text-sm">{senderLine}</p>
        </div>
        <div className="self-start bg-white shadow-sm rounded-2xl rounded-tl-none p-3 max-w-[85%]">
          <p className="text-sm">{reply}</p>
        </div>
        {confirmLine && (
          <div className="self-end max-w-[85%] bg-green-100 rounded-2xl rounded-tr-none p-3">
            <p className="text-sm">{confirmLine}</p>
          </div>
        )}
        {confirmReply && (
          <div className="self-start bg-white shadow-sm rounded-2xl rounded-tl-none p-3 max-w-[85%]">
            <p className="text-sm">{confirmReply}</p>
          </div>
        )}
      </div>
    </Reveal>
  );
}
