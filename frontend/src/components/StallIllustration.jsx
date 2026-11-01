/** A flat food-stall scene for the login screens. Pure SVG, so it scales cleanly. */
export default function StallIllustration() {
  const stripes = Array.from({ length: 8 }, (_, i) => i);
  // Bulbs hanging along a curve between the two posts.
  const bulbs = [0.06, 0.18, 0.3, 0.42, 0.54, 0.66, 0.78, 0.9].map((t) => {
    const u = 1 - t;
    return {
      x: u * u * 96 + 2 * u * t * 280 + t * t * 464,
      y: u * u * 36 + 2 * u * t * 92 + t * t * 36,
    };
  });

  return (
    <svg viewBox="0 0 560 440" className="auth-illustration" role="img" aria-label="A busy food stall">
      <circle cx="280" cy="215" r="196" fill="#FFF3E4" opacity=".75" />
      <circle cx="96" cy="120" r="34" fill="#FFE0BF" opacity=".8" />
      <circle cx="486" cy="96" r="22" fill="#FFE0BF" opacity=".8" />
      <ellipse cx="280" cy="398" rx="226" ry="16" fill="#D9A97C" opacity=".35" />

      {/* string lights */}
      <path d="M96 36 Q280 92 464 36" fill="none" stroke="#7C4A2D" strokeWidth="2" />
      {bulbs.map((b, i) => (
        <g key={i}>
          <circle cx={b.x} cy={b.y + 7} r="11" fill="#FFD166" opacity=".28" />
          <circle cx={b.x} cy={b.y + 7} r="5" fill="#FFC53D" />
        </g>
      ))}

      {/* posts */}
      <rect x="116" y="96" width="11" height="294" rx="4" fill="#7C4A2D" />
      <rect x="433" y="96" width="11" height="294" rx="4" fill="#7C4A2D" />

      {/* back wall + shelf */}
      <rect x="127" y="166" width="306" height="140" fill="#FFEED9" />
      <rect x="127" y="232" width="306" height="6" fill="#E8C9A4" />
      {[150, 168, 186].map((x, i) => (
        <rect key={x} x={x} y={208 - (i % 2) * 6} width="12" height={24 + (i % 2) * 6} rx="3" fill={['#E8590C', '#F59F00', '#2F9E6B'][i]} />
      ))}
      {[388, 404, 418].map((x, i) => (
        <rect key={x} x={x} y={210 - (i % 2) * 8} width="11" height={22 + (i % 2) * 8} rx="3" fill={['#F59F00', '#E8590C', '#B83A0B'][i]} />
      ))}

      {/* menu board */}
      <rect x="226" y="176" width="108" height="62" rx="9" fill="#33231B" />
      <text x="280" y="196" textAnchor="middle" fontSize="11" fontWeight="700" fill="#FFD166" fontFamily="Plus Jakarta Sans, sans-serif">
        TODAY'S MENU
      </text>
      <rect x="240" y="205" width="52" height="3" rx="1.5" fill="#FFF3E4" opacity=".85" />
      <rect x="300" y="205" width="22" height="3" rx="1.5" fill="#FFD166" />
      <rect x="240" y="217" width="40" height="3" rx="1.5" fill="#FFF3E4" opacity=".85" />
      <rect x="300" y="217" width="22" height="3" rx="1.5" fill="#FFD166" />
      <rect x="240" y="229" width="48" height="3" rx="1.5" fill="#FFF3E4" opacity=".85" />
      <rect x="300" y="229" width="22" height="3" rx="1.5" fill="#FFD166" />

      {/* awning */}
      <path d="M104 96 L140 62 H420 L456 96 Z" fill="#B83A0B" />
      {stripes.map((i) => (
        <path
          key={i}
          d={`M${104 + i * 44} 96 h44 v46 a22 22 0 0 1 -44 0 z`}
          fill={i % 2 === 0 ? '#E8590C' : '#FFF4E6'}
        />
      ))}

      {/* counter */}
      <rect x="100" y="304" width="360" height="90" rx="8" fill="#9A5B33" />
      {[130, 190, 250, 310, 370, 430].map((x) => (
        <rect key={x} x={x - 1} y="320" width="2" height="58" fill="#7C4A2D" opacity=".5" />
      ))}
      <rect x="90" y="292" width="380" height="18" rx="6" fill="#D49A68" />

      {/* pot with steam */}
      <path d="M148 292 v-34 a8 8 0 0 1 8 -8 h56 a8 8 0 0 1 8 8 v34 z" fill="#8A7B6E" />
      <rect x="144" y="246" width="80" height="9" rx="4" fill="#A89888" />
      <circle cx="184" cy="244" r="4" fill="#6F6258" />
      <path d="M166 232 q-8 -12 0 -22 q8 -10 0 -20" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".85" />
      <path d="M186 228 q-8 -12 0 -22 q8 -10 0 -20" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".6" />
      <path d="M206 232 q-8 -12 0 -22 q8 -10 0 -20" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".85" />

      {/* bowls */}
      <path d="M252 292 a30 22 0 0 0 60 0 z" fill="#fff" stroke="#E8C9A4" strokeWidth="2" />
      <ellipse cx="282" cy="291" rx="26" ry="8" fill="#F08A24" />
      <circle cx="274" cy="289" r="4" fill="#D9480F" />
      <circle cx="288" cy="287" r="3.5" fill="#FFD166" />
      <path d="M324 292 a24 18 0 0 0 48 0 z" fill="#fff" stroke="#E8C9A4" strokeWidth="2" />
      <ellipse cx="348" cy="291" rx="21" ry="6.5" fill="#79B04A" />

      {/* juice glass */}
      <path d="M394 292 l-4 -38 h26 l-4 38 z" fill="#FFE08A" fillOpacity=".95" />
      <path d="M392.5 272 h23 l-1.6 20 h-19.8 z" fill="#FFC53D" />
      <circle cx="403" cy="254" r="9" fill="#FFF0B8" stroke="#F59F00" strokeWidth="2" />
      <path d="M403 245 v18 M394 254 h18" stroke="#F59F00" strokeWidth="1.2" />
      <rect x="409" y="238" width="3" height="22" rx="1.5" fill="#E8590C" transform="rotate(14 409 238)" />

      {/* ledger + coins */}
      <rect x="428" y="274" width="38" height="18" rx="3" fill="#D9480F" />
      <rect x="432" y="278" width="24" height="2" rx="1" fill="#fff" opacity=".9" />
      <rect x="432" y="283" width="18" height="2" rx="1" fill="#fff" opacity=".7" />
      <ellipse cx="116" cy="290" rx="13" ry="4" fill="#E0A100" />
      <ellipse cx="116" cy="286" rx="13" ry="4" fill="#FFC53D" />
      <ellipse cx="116" cy="282" rx="13" ry="4" fill="#FFD166" />

      {/* sacks and crate outside the stall */}
      <path d="M44 394 v-58 q0 -12 12 -16 q-8 -8 0 -14 h28 q8 6 0 14 q12 4 12 16 v58 z" fill="#E8C9A4" />
      <path d="M52 330 h32" stroke="#C99D6E" strokeWidth="2" />
      <ellipse cx="68" cy="352" rx="10" ry="8" fill="#F08A24" opacity=".9" />
      <rect x="470" y="344" width="64" height="50" rx="5" fill="#C98A5B" />
      <rect x="470" y="344" width="64" height="9" rx="4" fill="#9A5B33" />
      {[484, 502, 520].map((x, i) => (
        <ellipse key={x} cx={x} cy={338 - (i % 2) * 4} rx="10" ry="8" fill="#FFD84D" />
      ))}
      <ellipse cx="502" cy="333" rx="8" ry="6" fill="#FFC53D" />
    </svg>
  );
}
