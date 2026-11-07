/** Pill bug mascot. It curls into a ball and rolls while work is running. */
export function Roly({
  curled,
  worried = false,
  className,
}: {
  curled: boolean;
  worried?: boolean;
  className?: string;
}) {
  if (curled)
    return (
      <svg
        className={className}
        viewBox="0 0 64 64"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx="32"
          cy="32"
          r="27"
          fill="var(--roly-shell)"
          stroke="currentColor"
          strokeWidth="3"
        />
        <g fill="none" stroke="currentColor" strokeWidth="2.6">
          <path d="M13 13c13 12 15 27 4 40" strokeLinecap="round" />
          <path d="M27 6c13 15 14 35 2 52" strokeLinecap="round" />
          <path d="M42 8c10 15 10 33 1 49" strokeLinecap="round" />
        </g>
        <circle cx="52" cy="33" r="4.5" fill="var(--roly-accent)" />
      </svg>
    );
  return (
    <svg
      className={className}
      viewBox="0 0 96 64"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <path strokeWidth="2.6" d="M78 22c5-8 9-11 15-12" />
        <path strokeWidth="2.6" d="M71 18c2-7 5-11 10-14" />
        <path
          strokeWidth="2.4"
          d="M22 54l-3 7M36 56l-1 7M50 56l1 7M64 54l3 7"
        />
      </g>
      <path
        d="M6 54C7 26 28 9 52 10c20 1 34 18 36 44 0 2-2 3-4 3H10c-3 0-4-1-4-3z"
        fill="var(--roly-shell)"
        stroke="currentColor"
        strokeWidth="3"
      />
      <g fill="none" stroke="currentColor" strokeWidth="2.6">
        <path d="M21 21c5 11 6 23 3 35" strokeLinecap="round" />
        <path d="M36 12c6 14 7 30 4 45" strokeLinecap="round" />
        <path d="M52 11c5 15 6 31 4 46" strokeLinecap="round" />
      </g>
      <circle cx="73" cy="36" r="5" fill="var(--roly-accent)" />
      {worried ? (
        <path
          d="M66 50c4-4 10-4 14 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M66 46c4 5 10 5 14 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** Roughens outlines so they read as pen lines. Render once per page. */
export function SketchDefs() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", width: 0, height: 0 }}
    >
      <filter id="r2r-rough">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.035"
          numOctaves="2"
          seed="7"
        />
        <feDisplacementMap in="SourceGraphic" scale="3" />
      </filter>
    </svg>
  );
}
