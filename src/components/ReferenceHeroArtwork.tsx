import type { DliRole } from '../auth/permissions';

/**
 * Original, scalable interface illustrations. They render as SVG, not raster
 * screenshots, so the actual DLI text, buttons and records remain selectable.
 * No third-party artwork or fabricated class information is embedded.
 */
export default function ReferenceHeroArtwork({ role }: { role: DliRole }) {
  const student = role === 'student';
  const tutor = role === 'tutor';
  return (
    <svg className="ref-hero-art" viewBox="0 0 340 220"
      aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ref-gold" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FFE08B"/><stop offset="1" stopColor="#E2A62C"/>
        </linearGradient>
        <linearGradient id="ref-blue" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#5EABFF"/><stop offset="1" stopColor="#16498B"/>
        </linearGradient>
        <linearGradient id="ref-shine" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FFFFFF"/><stop offset="1" stopColor="#D8E9FF"/>
        </linearGradient>
        <filter id="ref-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="#06162e" floodOpacity=".22"/>
        </filter>
      </defs>
      <ellipse cx="191" cy="190" rx="128" ry="14" fill="#031a39" opacity=".2"/>
      {student ? <>
        <g filter="url(#ref-shadow)">
          <path d="M98 165 L235 165 L259 179 L122 179 Z" fill="#E2A62C"/>
          <path d="M100 149 H241 V168 H100 Z" fill="url(#ref-shine)"/>
          <path d="M96 145 L239 145 L253 151 L110 151 Z" fill="#E2B64F"/>
          <path d="M114 131 H251 V149 H114 Z" fill="#D7E8FC"/>
          <path d="M110 126 L249 126 L260 132 L121 132 Z" fill="#16498B"/>
          <path d="M127 112 H255 V129 H127 Z" fill="#F9FBFF"/>
          <path d="M124 108 L252 108 L264 114 L136 114 Z" fill="#2A70C1"/>
          <path d="M107 78 L175 44 L258 75 L182 111 Z" fill="#0B244B" stroke="#D4B660" strokeWidth="3"/>
          <path d="M135 91 V119 Q181 148 222 116 V89 L180 107 Z" fill="#194A87"/>
          <path d="M259 77 V120" stroke="#F3C454" strokeWidth="4" strokeLinecap="round"/>
          <circle cx="259" cy="123" r="6" fill="#E2B64F"/>
        </g>
        <path d="M276 50 l7 12 12 6-12 5-7 12-5-12-12-5 12-6Z" fill="#F9D87B" opacity=".9"/>
      </> : tutor ? <>
        <g filter="url(#ref-shadow)">
          <rect x="100" y="41" width="171" height="119" rx="11" fill="#122741" stroke="#F3C454" strokeWidth="4"/>
          <rect x="111" y="52" width="149" height="98" rx="5" fill="url(#ref-shine)"/>
          <path d="M136 121 Q160 70 187 94 T231 72" fill="none" stroke="#4F92DB" strokeWidth="7" strokeLinecap="round"/>
          <circle cx="183" cy="88" r="12" fill="#F4C65E"/>
          <path d="M89 164 H279 L299 182 H72 Z" fill="#D6E9FE"/>
          <path d="M72 182 H299 V187 H72 Z" fill="#F3C454"/>
          <path d="M51 139 H89 V186 H51 Z" fill="#E2B64F"/>
          <path d="M60 119 H83 V140 H60 Z" fill="#FFF5D9"/>
          <path d="M314 142 L322 184 H307 Z" fill="#63BDCA"/>
        </g>
        <path d="M57 77 l7 11 11 5-11 5-7 12-6-12-11-5 11-5Z" fill="#F9D87B"/>
      </> : <>
        <g filter="url(#ref-shadow)">
          <rect x="64" y="49" width="229" height="134" rx="16" fill="#FFFFFF" fillOpacity=".13" stroke="#FFFFFF" strokeOpacity=".32" strokeWidth="2"/>
          <path d="M91 159 V134 H119 V159Z" fill="#5BA8EF"/>
          <path d="M133 159 V105 H161 V159Z" fill="#F3C35A"/>
          <path d="M175 159 V88 H203 V159Z" fill="#89C7E8"/>
          <path d="M217 159 V64 H245 V159Z" fill="url(#ref-gold)"/>
          <path d="M87 126 Q138 144 174 90 T262 77" fill="none" stroke="#D8F0FF" strokeWidth="4" strokeLinecap="round"/>
          <circle cx="174" cy="90" r="7" fill="#FFFFFF"/>
          <circle cx="262" cy="77" r="7" fill="#F3C454"/>
        </g>
      </>}
    </svg>
  );
}
