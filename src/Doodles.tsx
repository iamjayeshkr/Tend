export function Sprout({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M31 53c4-15 4-24 1-33M33 35C16 36 8 26 10 15c16-2 26 7 23 20Zm0-8C32 12 41 5 53 7c1 15-8 23-20 20Z"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 55q12-4 24 0"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function Garden({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 380 310"
      fill="none"
      aria-hidden="true"
    >
      <g
        stroke="#243f32"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M82 261c54 5 169 9 238-7" opacity=".4" />
        <path d="m135 208 10 63c21 15 59 16 78-1l13-62" fill="#eeb886" />
        <ellipse cx="185" cy="208" rx="52" ry="13" fill="#f5d7b6" />
        <path d="M146 244c24 9 51 10 78 2" />
        <path d="M184 204c5-61-17-89 5-146" />
        <path
          d="M180 151c-42 5-76-20-84-55 36-11 83 10 84 55Z"
          fill="#b8d5a1"
        />
        <path d="M187 113c42 11 72-11 91-45-46-12-88 5-91 45Z" fill="#a6c78e" />
        <path d="M188 66c-32-5-43-28-36-49 32 4 52 20 36 49Z" fill="#cbdba5" />
        <path d="m107 103 71 45m15-37 70-36m-107-51 27 34" />
        <path d="M172 170q5 5 9 0m13 1q5 5 9-1m-21 15q8 9 15-1" />
        <path
          d="M77 207c-4-9-2-20 6-23 9-4 15 5 12 15 7-7 15-6 18 1 4 9-5 16-19 17Z"
          fill="#f6e09e"
        />
        <path d="m73 219 18 10m-19 2 14 6m218-92 6 14m-14-4 20-5m-223-82 5 10m-10-2 13-5" />
        <path d="M290 210q19-11 27 0l-8 27q-13 8-26-2Z" fill="#c2b9d9" />
        <path d="m292 205 7-30q10-9 17 1l-10 29m-6-4 9-27" />
        <path
          d="M48 132c-3-16 18-21 21-7 4 17-28 22-25 39"
          strokeDasharray="3 6"
        />
        <path d="M324 87c-2-6 5-10 9-5 4-9 14-3 9 4l-11 9Z" fill="#e9a185" />
        <path d="m244 261 23-2m-20 11 16-2" />
      </g>
      <g fill="#243f32">
        <circle cx="72" cy="102" r="2" />
        <circle cx="299" cy="118" r="2" />
        <circle cx="124" cy="62" r="1.7" />
      </g>
    </svg>
  );
}
export function SunDoodle() {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M33 36c11-13 35-6 37 10 3 20-23 33-36 17-8-9-8-19-1-27Z" />
        <path d="m48 9 1 12m27-3-7 10m21 19-11 2M79 77l-9-8M47 90l1-12M17 76l11-9M9 47l12 2m-2-31 10 11" />
        <path d="M38 48v3m19-3v3m-17 9q8 7 14-1" />
      </g>
    </svg>
  );
}
export function Star({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 50 50"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m26 4 5 14 15 5-14 7-6 15-7-15-15-6 15-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="m25 16 1 16m-7-8 13 1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
