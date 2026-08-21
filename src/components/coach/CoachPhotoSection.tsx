"use client";

import { useRef, useState, useTransition } from "react";
import { downscaleImage } from "@/lib/club/downscale-image";
import { uploadCoachPhoto, addCoachGalleryImage, deleteCoachGalleryImage } from "@/app/(coach)/coach/actions";
import { CLUB_TOKENS as T } from "./tokens";
import { MAX_GALLERY_IMAGES } from "@/lib/club/media";

// Profile photo and gallery.
//
// "Add a profile photo" is a publish blocker, so until this existed a coach
// could complete every other step and still not be able to go live.
//
// The two are deliberately separate: the portrait is the face on a card and
// in the Coach OS sidebar, while the gallery is what a client pages through
// on the discovery feed. A coach's own photos are never mixed with the
// discipline stand-ins — uploading one replaces the placeholder entirely,
// so a card never implies stock imagery is theirs.

export function CoachPhotoSection({
  photoUrl,
  gallery,
}: {
  photoUrl: string | null;
  gallery: Array<{ id: string; url: string }>;
}) {
  return (
    <section className="rounded-2xl border p-5" style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}>
      <h2 className="text-base font-semibold">Photos</h2>
      <p className="mt-1 text-sm" style={{ color: T.onSurfaceVariant }}>
        A profile photo is required before you can publish. Gallery photos appear on your card
        when clients browse.
      </p>

      <div className="mt-5 flex flex-wrap items-start gap-6">
        <PortraitUpload photoUrl={photoUrl} />
        <GalleryUpload gallery={gallery} />
      </div>
    </section>
  );
}

function PortraitUpload({ photoUrl }: { photoUrl: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: T.onSurfaceVariant }}>
        Profile photo
      </p>
      <div className="flex items-center gap-3">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
          <img src={photoUrl} alt="Your profile photo" className="h-20 w-20 rounded-2xl object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-dashed text-xs"
               style={{ borderColor: T.outlineVariant, color: T.onSurfaceVariant }}>
            None
          </div>
        )}
        <div>
          <button
            type="button"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
            className="rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: T.outlineVariant }}
          >
            {pending ? "Uploading…" : photoUrl ? "Replace" : "Upload photo"}
          </button>
          <p className="mt-1.5 text-xs" style={{ color: T.onSurfaceVariant }}>JPG or PNG, up to 8MB.</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Clear the input straight away so picking the SAME file again
          // still fires a change event (a retry after a failed upload).
          e.target.value = "";
          if (!file) return;
          setError(null);
          start(async () => {
            try {
              const body = new FormData();
              body.set("photo", await downscaleImage(file));
              const result = await uploadCoachPhoto(body);
              if (!result.ok) setError(result.error);
            } catch {
              // A throw here used to escape the transition and hit the
              // error boundary, replacing the whole settings page with
              // "Something went wrong" — which is what a coach saw when
              // their photo exceeded the Server Action body limit.
              setError("That photo couldn't be uploaded. Please try again, or pick a smaller one.");
            }
          });
        }}
      />
      {error && <p className="mt-2 text-xs" style={{ color: T.error }}>{error}</p>}
    </div>
  );
}

function GalleryUpload({ gallery }: { gallery: Array<{ id: string; url: string }> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const full = gallery.length >= MAX_GALLERY_IMAGES;

  return (
    <div className="min-w-[16rem] flex-1">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: T.onSurfaceVariant }}>
        Gallery ({gallery.length}/{MAX_GALLERY_IMAGES})
      </p>

      <div className="flex flex-wrap gap-2">
        {gallery.map((g) => (
          <div key={g.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
            <img src={g.url} alt="" className="h-20 w-20 rounded-xl object-cover" />
            <button
              type="button"
              aria-label="Remove this photo"
              disabled={pending}
              onClick={() => {
                setError(null);
                const body = new FormData();
                body.set("mediaId", g.id);
                start(async () => {
                  try {
                    const result = await deleteCoachGalleryImage(body);
                    if (!result.ok) setError(result.error);
                  } catch {
                    setError("That photo couldn't be removed. Please try again.");
                  }
                });
              }}
              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-xs leading-none shadow"
              style={{ backgroundColor: T.surfaceContainerLowest, color: T.error }}
            >
              ×
            </button>
          </div>
        ))}

        {!full && (
          <button
            type="button"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
            className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed text-2xl disabled:opacity-60"
            style={{ borderColor: T.outlineVariant, color: T.onSurfaceVariant }}
            aria-label="Add a gallery photo"
          >
            {pending ? "…" : "+"}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError(null);
          start(async () => {
            try {
              const body = new FormData();
              body.set("photo", await downscaleImage(file));
              const result = await addCoachGalleryImage(body);
              if (!result.ok) setError(result.error);
            } catch {
              setError("That photo couldn't be uploaded. Please try again, or pick a smaller one.");
            }
          });
        }}
      />
      {error && <p className="mt-2 text-xs" style={{ color: T.error }}>{error}</p>}
    </div>
  );
}
