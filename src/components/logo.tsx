import fs from "node:fs";
import path from "node:path";

/**
 * Shows public/brand/frasa-logo.png (or .svg) when Frasa has supplied it;
 * otherwise a text wordmark in the logo's orange.
 */
export function Logo({ onDark = false }: { onDark?: boolean }) {
  const file = ["frasa-logo.svg", "frasa-logo.png"].find((f) =>
    fs.existsSync(path.join(process.cwd(), "public", "brand", f)),
  );
  return (
    <span className="flex items-center gap-2.5">
      {file ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/brand/${file}`} alt="Frasa" className="h-7 w-auto" />
      ) : (
        <span className="text-[22px] font-black leading-none tracking-[0.14em] text-brand">FRASA</span>
      )}
      <span className="leading-tight">
        <span className={`block text-sm font-bold ${onDark ? "text-white" : "text-ink"}`}>Frasa HQ</span>
        <span className="block whitespace-nowrap text-[8px] font-semibold uppercase tracking-[0.12em] text-brand">
          International Trading
        </span>
      </span>
    </span>
  );
}
