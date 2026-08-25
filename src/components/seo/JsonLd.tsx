/** Renders a JSON-LD graph into the document.
 *
 * A plain <script type="application/ld+json">, not next/script: structured
 * data has to be in the server-rendered HTML. next/script defers execution
 * to the client, and a crawler that reads HTML without running JavaScript
 * would find nothing — which is most of the crawlers this exists for.
 *
 * Server component by default (no "use client"), so the JSON is serialised
 * once at render time and ships as static markup.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // Escaping "<" as < is the standard guard against a string value
      // inside the payload containing "</script>" and closing the tag
      // early. JSON.stringify alone does not escape it, and the browser's
      // tokenizer does not care that it is inside a JSON string literal.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
