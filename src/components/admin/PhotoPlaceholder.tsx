/** Stands in for a meal photo in the review queue.
 *
 * There are two reasons a thumbnail is missing and they are not the same
 * reason. A meal described in WhatsApp text never had a photo — normal, and
 * about 15% of submissions. A meal whose signed URL failed does have one,
 * and that is our bug. Both used to render as the same blank grey square,
 * so the failure mode was invisible from the queue and a text-logged meal
 * looked broken.
 */
export function PhotoPlaceholder({
  hasStoredPhoto,
  className = "",
}: {
  /** True when a photo exists in storage but could not be signed. */
  hasStoredPhoto: boolean;
  /** Size/shape classes from the call site, so the queue's two layouts
   * keep their own dimensions. */
  className?: string;
}) {
  return hasStoredPhoto ? (
    <div
      className={`flex items-center justify-center bg-red-50 border border-red-200 text-red-600 flex-shrink-0 ${className}`}
      title="A photo was uploaded but could not be loaded — storage problem on our side"
      aria-label="Photo failed to load"
    >
      <span aria-hidden="true" className="text-sm font-bold">!</span>
    </div>
  ) : (
    <div
      className={`flex items-center justify-center bg-gray-100 text-gray-400 flex-shrink-0 ${className}`}
      title="Logged from a text description — no photo was sent"
      aria-label="Text-only meal, no photo"
    >
      <span aria-hidden="true" className="text-[10px] font-semibold uppercase tracking-wide">txt</span>
    </div>
  );
}
