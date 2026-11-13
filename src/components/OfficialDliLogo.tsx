/**
 * Official DLI-ONLINE emblem sourced from the organisation's approved
 * blue-and-gold logo asset. The single public mark is reused across pages.
 * Keep the image intact; no role or theme may substitute a placeholder.
 */
type OfficialDliLogoProps = {
  className?: string;
  decorative?: boolean;
};

export default function OfficialDliLogo({
  className,
  decorative = false,
}: OfficialDliLogoProps) {
  return <img
    className={className ? `official-dli-logo ${className}` : 'official-dli-logo'}
    src="/dli-mark.svg"
    alt={decorative ? '' : 'DLI-ONLINE official logo'}
    aria-hidden={decorative ? true : undefined}
    width={120}
    height={120}
    decoding="async"
    draggable={false}
  />;
}
