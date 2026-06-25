interface LogoProps {
  className?: string;
}

/**
 * Markdown Reviewer brand mark: the markdown `M↓` inside a review comment
 * bubble on a navy app tile. Mirrors `src-tauri/icons/icon.svg` (the source
 * of the generated app icons), so the in-app logo and the OS icon match.
 */
export function Logo({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="mr-logo-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#13243a" />
          <stop offset="1" stopColor="#0b1626" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill="url(#mr-logo-tile)" />
      <path
        d="M150 132 H362 a52 52 0 0 1 52 52 V300 a52 52 0 0 1 -52 52 H250 l-66 60 v-60 H150 a52 52 0 0 1 -52 -52 V184 a52 52 0 0 1 52 -52 Z"
        fill="#2563eb"
      />
      <path
        d="M156 300 V196 l52 58 52 -58 V300"
        fill="none"
        stroke="#ffffff"
        strokeWidth="28"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M330 196 V286" fill="none" stroke="#ffffff" strokeWidth="28" strokeLinecap="round" />
      <path
        d="M300 256 L330 292 360 256"
        fill="none"
        stroke="#ffffff"
        strokeWidth="28"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
