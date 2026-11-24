// The drawn "Blakejack" wordmark (public/brand/wordmark.svg, made by the mockup's build.mjs), inline so the ink follows
// the text colour and the j's diamond takes the accent. Decorative: put the name beside it as text for screen readers. //
export default function Wordmark({ className }) {
  return (
    <svg className={className} viewBox="-2 -2 276 64" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="6" strokeLinejoin="miter" strokeLinecap="butt">
        <path d="M3 4V44M3 4H14A9.5 9.5 0 0 1 14 23H3M3 23H16A10.5 10.5 0 0 1 16 44H3" />
        <path d="M38 4V44" />
        <path d="M77 16V44M63 16A14 14 0 1 0 63 44A14 14 0 1 0 63 16" />
        <path d="M89 4V44M89 33L106 16M96 26L108 44" />
        <path d="M117 30H145A14 14 0 1 0 140.9 39.9" />
        <path d="M162 16V50A8 8 0 0 1 154 58H150" />
        <path d="M203 16V44M189 16A14 14 0 1 0 189 44A14 14 0 1 0 189 16" />
        <path d="M238.9 20.1A14 14 0 1 0 238.9 39.9" />
        <path d="M250 4V44M250 33L267 16M257 26L269 44" />
      </g>
      <path d="M162 0L166.5 4.5L162 9L157.5 4.5Z" fill="var(--accent)" />
    </svg>
  );
}
