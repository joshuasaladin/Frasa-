import { Icon } from "@/components/icons";
import { Card } from "@/components/ui";
import type { SopAttachment, SopVersion } from "./queries";
import { formatBytes } from "./types";

/** The readable body of one SOP version: purpose, steps, links and attachments. */
export function SopContent({
  sopId,
  version,
  attachments,
}: {
  sopId: string;
  version: SopVersion;
  attachments: SopAttachment[];
}) {
  return (
    <div className="space-y-4">
      <Card title="Purpose">
        {version.purpose ? (
          <p className="whitespace-pre-line text-[15px] leading-relaxed">{version.purpose}</p>
        ) : (
          <p className="text-sm text-muted">No purpose written yet.</p>
        )}
      </Card>

      <Card title={`Steps (${version.steps.length})`}>
        {version.steps.length === 0 ? (
          <p className="text-sm text-muted">No steps written yet.</p>
        ) : (
          <ol className="space-y-4">
            {version.steps.map((step, index) => (
              <li key={index} className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-900 text-base font-bold text-white">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 pt-1.5">
                  {step.title ? <p className="text-base font-semibold leading-snug">{step.title}</p> : null}
                  {step.detail ? (
                    <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-ink/85">{step.detail}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {version.links.length > 0 || attachments.length > 0 ? (
        <Card title="Links and attachments">
          <ul className="divide-y divide-line">
            {version.links.map((link, index) => (
              <li key={`l${index}`}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center gap-2.5 py-2 text-[15px] font-medium text-forest-600 hover:underline"
                >
                  <Icon name="link" />
                  <span className="min-w-0 break-words">{link.label || link.url}</span>
                </a>
              </li>
            ))}
            {attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={`/sops/${sopId}/attachments/${a.id}`}
                  className="flex min-h-11 items-center gap-2.5 py-2 text-[15px] font-medium text-forest-600 hover:underline"
                >
                  <Icon name="clip" />
                  <span className="min-w-0 break-words">{a.fileName}</span>
                  <span className="shrink-0 text-xs font-normal text-muted">{formatBytes(a.sizeBytes)}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
