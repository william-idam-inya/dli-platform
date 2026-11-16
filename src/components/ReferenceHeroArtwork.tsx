import type { DliRole } from '../auth/permissions';

/**
 * Original, scalable 3D-styled interface illustrations for DLI Academic Pro v2.0.
 * Pure vector SVG with modern gradients, depth shading, and crisp curves.
 */
export default function ReferenceHeroArtwork({ role }: { role: DliRole }) {
  const student = role === 'student';
  const tutor = role === 'tutor';
  return (
    <svg className="ref-hero-art" viewBox="0 0 340 220"
      aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ref-gold" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FFE59E"/>
          <stop offset="0.5" stopColor="#E2B64F"/>
          <stop offset="1" stopColor="#B38622"/>
        </linearGradient>
        <linearGradient id="ref-blue" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#4FA0FF"/>
          <stop offset="0.6" stopColor="#1B4B91"/>
          <stop offset="1" stopColor="#112744"/>
        </linearGradient>
        <linearGradient id="ref-shine" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FFFFFF" stopOpacity="0.95"/>
          <stop offset="0.6" stopColor="#E2EEFF" stopOpacity="0.8"/>
          <stop offset="1" stopColor="#C4DDFF" stopOpacity="0.4"/>
        </linearGradient>
        <linearGradient id="ref-emerald" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#34D399"/>
          <stop offset="1" stopColor="#0D9278"/>
        </linearGradient>
        <linearGradient id="ref-cyan" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#38BDF8"/>
          <stop offset="1" stopColor="#0284C7"/>
        </linearGradient>
        <filter id="ref-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#06162e" floodOpacity=".32"/>
        </filter>
        <filter id="ref-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      
      {/* Soft floor shadow */}
      <ellipse cx="185" cy="192" rx="130" ry="15" fill="#06162e" opacity=".28"/>

      {student ? (
        /* 3D Graduation Cap on Stacked Academic Books with Golden Ribbon */
        <g filter="url(#ref-shadow)">
          {/* Bottom Book (Navy & Gold) */}
          <path d="M78 168 L220 168 L258 182 L116 182 Z" fill="#0F2A4A"/>
          <path d="M78 152 H222 V170 H78 Z" fill="url(#ref-shine)"/>
          <path d="M74 148 L224 148 L250 156 L100 156 Z" fill="url(#ref-gold)"/>

          {/* Middle Book (Royal Blue) */}
          <path d="M96 136 L238 136 L266 148 L124 148 Z" fill="#143A68"/>
          <path d="M98 122 H242 V138 H98 Z" fill="#F0F5FC"/>
          <path d="M94 118 L240 118 L256 124 L110 124 Z" fill="url(#ref-blue)"/>

          {/* Top Book (DLI Gold Spine) */}
          <path d="M112 108 L250 108 L272 118 L134 118 Z" fill="#C9972C"/>
          <path d="M114 96 H254 V110 H114 Z" fill="#FFFFFF"/>
          <path d="M110 92 L252 92 L266 98 L124 98 Z" fill="url(#ref-gold)"/>

          {/* Golden Ribbon Marker hanging down */}
          <path d="M210 110 L216 162 L206 156 L196 162 L202 110 Z" fill="#FFE08B" stroke="#E2B64F" strokeWidth="1.5"/>

          {/* 3D Mortarboard / Graduation Cap */}
          {/* Cap Skull cap / Underneath base */}
          <path d="M130 68 V96 Q180 122 230 96 V68 Q180 92 130 68 Z" fill="#102747"/>
          <path d="M138 74 V94 Q180 116 222 94 V74 Q180 94 138 74 Z" fill="#1B4B91"/>

          {/* Cap Diamond Top (Beveled 3D look) */}
          <path d="M98 56 L180 26 L262 56 L180 86 Z" fill="#0C1F38" stroke="url(#ref-gold)" strokeWidth="3"/>
          <path d="M104 56 L180 32 L256 56 L180 80 Z" fill="url(#ref-blue)"/>
          <path d="M112 56 L180 37 L248 56 L180 75 Z" fill="#1E529E" opacity="0.4"/>

          {/* Center Button and Golden Tassel */}
          <circle cx="180" cy="56" r="5" fill="#FFE59E" stroke="#B38622" strokeWidth="1.5"/>
          <path d="M180 56 Q230 58 248 88" fill="none" stroke="url(#ref-gold)" strokeWidth="3.5" strokeLinecap="round"/>
          <rect x="244" y="86" width="9" height="18" rx="2" fill="url(#ref-gold)"/>
          <circle cx="248.5" cy="86" r="4.5" fill="#FFE59E"/>

          {/* Ambient Sparkles */}
          <path d="M272 32 l5 9 9 5-9 5-5 9-5-9-9-5 9-5Z" fill="#FFE08B" opacity=".95"/>
          <path d="M84 76 l3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" fill="#FFE08B" opacity=".8"/>
        </g>
      ) : tutor ? (
        /* 3D Laptop with Glowing Interactive Teaching Workspace */
        <g filter="url(#ref-shadow)">
          {/* Laptop Base */}
          <path d="M72 168 H288 L308 184 H52 Z" fill="#0B1C33"/>
          <path d="M52 184 H308 V188 H52 Z" fill="url(#ref-gold)"/>
          <rect x="156" y="170" width="48" height="6" rx="2" fill="#204068"/>

          {/* Laptop Screen Bezel */}
          <rect x="88" y="38" width="184" height="126" rx="10" fill="#0B1C33" stroke="url(#ref-gold)" strokeWidth="3.5"/>

          {/* Screen Content (Vibrant Blue Workspace with Code/Charts) */}
          <rect x="96" y="46" width="168" height="110" rx="6" fill="#112744"/>
          <rect x="104" y="54" width="70" height="8" rx="3" fill="#1B4B91"/>
          
          {/* Learning Visual Chart on Screen */}
          <path d="M106 130 Q130 92 152 108 T198 80 T240 96" fill="none" stroke="#38BDF8" strokeWidth="4.5" strokeLinecap="round"/>
          <circle cx="152" cy="108" r="5" fill="#FFE08B"/>
          <circle cx="198" cy="80" r="5" fill="#34D399"/>
          <circle cx="240" cy="96" r="5" fill="#38BDF8"/>
          
          {/* Dashboard Mini Cards on Screen */}
          <rect x="106" y="70" width="36" height="22" rx="4" fill="#1A3B66"/>
          <rect x="148" y="70" width="36" height="22" rx="4" fill="#1A3B66"/>

          {/* Coffee Mug on the side */}
          <rect x="30" y="142" width="28" height="34" rx="5" fill="url(#ref-gold)"/>
          <path d="M58 148 Q68 158 58 168" fill="none" stroke="url(#ref-gold)" strokeWidth="3.5"/>
          <ellipse cx="44" cy="142" rx="14" ry="4" fill="#FFE59E"/>
          {/* Steam from coffee */}
          <path d="M38 136 Q42 128 39 122" fill="none" stroke="#D1E4FA" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
          <path d="M46 134 Q50 126 47 120" fill="none" stroke="#D1E4FA" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
        </g>
      ) : (
        /* 3D Ascending Operations Bar Chart with Platform Metrics */
        <g filter="url(#ref-shadow)">
          {/* Background Card */}
          <rect x="62" y="38" width="236" height="142" rx="18" fill="#0C203B" stroke="rgba(255,255,255,0.18)" strokeWidth="2"/>
          <rect x="64" y="40" width="232" height="138" rx="16" fill="url(#ref-shine)" opacity="0.04"/>

          {/* 3D Bar 1 - Cyan (Users) */}
          <path d="M88 158 V126 H116 V158 Z" fill="url(#ref-cyan)"/>
          <path d="M88 126 L96 118 H124 L116 126 Z" fill="#7DD3FC"/>
          <path d="M116 126 L124 118 V150 L116 158 Z" fill="#0369A1"/>

          {/* 3D Bar 2 - Gold (Classes) */}
          <path d="M132 158 V98 H160 V158 Z" fill="url(#ref-gold)"/>
          <path d="M132 98 L140 90 H168 L160 98 Z" fill="#FEF08A"/>
          <path d="M160 98 L168 90 V150 L160 158 Z" fill="#A16207"/>

          {/* 3D Bar 3 - Emerald (Payments) */}
          <path d="M176 158 V82 H204 V158 Z" fill="url(#ref-emerald)"/>
          <path d="M176 82 L184 74 H212 L204 82 Z" fill="#6EE7B7"/>
          <path d="M204 82 L212 74 V150 L204 158 Z" fill="#047857"/>

          {/* 3D Bar 4 - Royal Blue (Growth) */}
          <path d="M220 158 V58 H248 V158 Z" fill="url(#ref-blue)"/>
          <path d="M220 58 L228 50 H256 L248 58 Z" fill="#60A5FA"/>
          <path d="M248 58 L256 50 V150 L248 158 Z" fill="#1D4ED8"/>

          {/* Ascending Trendline with Glow */}
          <path d="M84 128 Q140 134 172 82 T268 52" fill="none" stroke="#FFE59E" strokeWidth="4.5" strokeLinecap="round"/>
          <circle cx="172" cy="82" r="6" fill="#FFFFFF" stroke="#E2B64F" strokeWidth="2.5"/>
          <circle cx="268" cy="52" r="7" fill="#FFE59E" stroke="#B38622" strokeWidth="2.5"/>

          {/* Upward Arrow */}
          <path d="M260 52 L274 46 L270 60 Z" fill="#FFE59E"/>
        </g>
      )}
    </svg>
  );
}
