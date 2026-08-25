"use client";

import { useRef } from "react";

/** The coach's portrait, clickable to see it at full size.
 *
 * A native <dialog> rather than a hand-rolled overlay: Escape to close, a
 * focus trap, background inerting and the ::backdrop are all behaviour the
 * browser already implements correctly, and every one of them is a thing
 * hand-rolled modals get wrong.
 *
 * The thumbnail is a <button>, not a clickable <img>, so it is reachable by
 * keyboard and announced as something that can be activated.
 */
export function Portrait({
  name,
  photoUrl,
  hasUploadedPhoto,
}: {
  name: string;
  photoUrl: string | null;
  /** Distinguishes "this coach never uploaded one" from "we failed to sign
   * the URL" — the first is their outstanding step, the second is our bug. */
  hasUploadedPhoto: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  if (!photoUrl) {
    const letters =
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("") || "?";
    return (
      <div
        className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-sm font-semibold text-gray-400"
        title={hasUploadedPhoto ? "Photo uploaded but could not be signed" : "No photo uploaded"}
      >
        {letters}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
        aria-label={`View ${name}'s profile photo at full size`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
          style={{ objectPosition: "center 35%" }}
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
          View
        </span>
      </button>

      <dialog
        ref={dialogRef}
        // m-auto is load-bearing: a modal <dialog> centres itself with
        // margin:auto, and Tailwind's preflight resets margin to 0 on every
        // element — without this the modal renders pinned to the top-left
        // corner, and clicks meant for the backdrop land on the photo.
        className="m-auto max-h-[90vh] max-w-[min(90vw,640px)] rounded-xl p-0 backdrop:bg-black/70"
        // Clicking the backdrop closes. The dialog element itself fills the
        // whole box, so a click landing on <dialog> rather than its child is
        // by definition a click outside the content.
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <figure className="m-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
          <img
            src={photoUrl}
            alt={`${name}'s profile photo`}
            className="block max-h-[75vh] w-full object-contain"
          />
          <figcaption className="flex items-center justify-between gap-4 border-t border-gray-200 px-4 py-3">
            <span className="text-sm font-medium text-gray-900">{name}</span>
            <span className="flex items-center gap-3">
              <a
                href={photoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-900"
              >
                Open original ↗
              </a>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                Close
              </button>
            </span>
          </figcaption>
        </figure>
      </dialog>
    </>
  );
}
