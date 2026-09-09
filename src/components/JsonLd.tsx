import type { JsonLdNode } from "@/lib/structured-data";

/// Renders a JSON-LD graph as a <script type="application/ld+json">.
///
/// A plain <script>, not next/script: JSON-LD is data, never executed, and
/// next/script's loading strategies would only risk deferring it past the
/// point a crawler reads the document. This is also why the component has no
/// "use client" — it must be in the server-rendered HTML, since that is all
/// most crawlers parse.
///
/// The `.replace(/</g, "\\u003c")` is the sanitisation step Next's JSON-LD
/// guide calls for. JSON.stringify will happily emit the literal characters
/// "</script>" if any input string contains them, which closes this tag early
/// and turns the rest of the payload into markup. Today every value comes from
/// our own constants, but this component takes an arbitrary object — the guard
/// belongs at the boundary, not in the callers' heads.
export function JsonLd({ data }: { data: JsonLdNode | JsonLdNode[] }) {
  const nodes = Array.isArray(data) ? data : [data];

  return (
    <>
      {nodes.map((node, index) => (
        <script
          // Separate tags rather than one array payload: both are valid, and
          // one malformed node then can't invalidate the parse of the others.
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(node).replace(/</g, "\\u003c"),
          }}
        />
      ))}
    </>
  );
}
