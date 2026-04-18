/**
 * Split-screen sign-in page.
 * Left 60%: cinematic slideshow of landmark Indian courts / cases.
 * Right 40%: Clerk sign-in card with MiniHarvey brand.
 *
 * Images are hotlinked from Wikimedia Commons (CC BY-SA 4.0).
 */
import { useState, useEffect } from 'react';
import { SignIn } from '@clerk/clerk-react';
import { Scale, ChevronDown, ExternalLink } from 'lucide-react';

interface Slide {
  image: string;
  /** Small context chip above the title — clarifies the forum when the photo is only thematic */
  court?: string;
  title: string;
  citation: string;
  legacy: string;
  /** Rich detail revealed when the caption is clicked */
  summary: {
    bench?: string;
    holding: string;
    significance: string;
  };
}

const SLIDES: Slide[] = [
  {
    image:
      'https://upload.wikimedia.org/wikipedia/commons/d/d4/Supreme_Court_of_India_-_200705_%28cropped%29.jpg',
    title: 'Supreme Court of India',
    citation: 'Tilak Marg, New Delhi',
    legacy: 'Where the Constitution speaks.',
    summary: {
      holding:
        'Apex court of India established under Article 124 of the Constitution. Sits as the final court of appeal and the guardian of the Constitution.',
      significance:
        'Exercises original, appellate, and advisory jurisdiction. Its judgments bind every court within the territory of India under Article 141.',
    },
  },
  {
    image:
      'https://upload.wikimedia.org/wikipedia/commons/5/5d/Supreme_Court_of_India_-_Central_Wing.jpg',
    court: 'Supreme Court of India · 1973',
    title: 'Kesavananda Bharati v. State of Kerala',
    citation: 'AIR 1973 SC 1461',
    legacy: 'The Basic Structure Doctrine is born.',
    summary: {
      bench: '13-judge bench · 7-6 majority',
      holding:
        'Parliament has wide amending power under Article 368, but cannot alter the "basic structure" of the Constitution.',
      significance:
        'Supremacy of the Constitution, rule of law, separation of powers, judicial review, federalism and secularism are beyond Parliament\'s reach — the bedrock of Indian constitutional law.',
    },
  },
  {
    image:
      'https://upload.wikimedia.org/wikipedia/commons/3/34/Building_of_The_Supreme_Court_of_India.jpg',
    court: 'Supreme Court of India · 1978',
    title: 'Maneka Gandhi v. Union of India',
    citation: 'AIR 1978 SC 597',
    legacy: 'Article 21 reborn — due process, reasonable procedure.',
    summary: {
      bench: '7-judge bench',
      holding:
        'The "procedure established by law" under Article 21 must be fair, just and reasonable — not arbitrary or oppressive.',
      significance:
        'Read Articles 14, 19 and 21 as a "golden triangle". Opened the door to every subsequent expansion of fundamental rights — from environment to privacy to dignity.',
    },
  },
  {
    image:
      'https://upload.wikimedia.org/wikipedia/commons/4/46/Calcutta_High_Court_Centenary_Building_-_Kolkata_2011-12-18_0354.JPG',
    court: 'Supreme Court of India · 1997',
    title: 'Vishaka v. State of Rajasthan',
    citation: 'AIR 1997 SC 3011',
    legacy: 'Guidelines that became law — workplace harassment.',
    summary: {
      bench: '3-judge bench · CJI J.S. Verma',
      holding:
        'Sexual harassment at the workplace violates Articles 14, 15, 19(1)(g) and 21. Laid down binding guidelines for prevention and redressal.',
      significance:
        'Vishaka Guidelines governed Indian workplaces for 16 years until codified by the POSH Act, 2013. A landmark in judicial law-making to fill a legislative vacuum.',
    },
  },
  {
    image:
      'https://upload.wikimedia.org/wikipedia/commons/e/ee/Mumbai_03-2016_41_Bombay_High_Court.jpg',
    court: 'Supreme Court of India · 2017',
    title: 'Puttaswamy v. Union of India',
    citation: '(2017) 10 SCC 1',
    legacy: 'Privacy is a fundamental right.',
    summary: {
      bench: '9-judge bench · unanimous',
      holding:
        'The right to privacy is a fundamental right, intrinsic to life and personal liberty under Article 21 and across Part III.',
      significance:
        'Overruled M.P. Sharma and Kharak Singh. Became the constitutional foundation for data protection, Aadhaar limits, and the decriminalisation decisions that followed.',
    },
  },
  {
    image:
      'https://upload.wikimedia.org/wikipedia/commons/a/a9/Inside_the_Supreme_Court_of_India._16.jpg',
    court: 'Supreme Court of India · 2018',
    title: 'Navtej Singh Johar v. Union of India',
    citation: '(2018) 10 SCC 1',
    legacy: 'Section 377 read down — dignity affirmed.',
    summary: {
      bench: '5-judge Constitution bench · unanimous',
      holding:
        'Section 377 IPC, to the extent it criminalised consensual same-sex relations between adults, is unconstitutional — violating Articles 14, 15, 19 and 21.',
      significance:
        'Affirmed dignity, autonomy and constitutional morality over majoritarian morality. Overruled Suresh Kumar Koushal (2013).',
    },
  },
  {
    image:
      'https://upload.wikimedia.org/wikipedia/commons/0/0d/India-constitution-preamble.svg',
    title: 'The Preamble',
    citation: 'Constitution of India · 1950',
    legacy: 'We, the People of India...',
    summary: {
      holding:
        'Declares India a sovereign, socialist, secular, democratic republic — committed to justice, liberty, equality and fraternity.',
      significance:
        'Held in Kesavananda Bharati (1973) to be part of the Constitution and a guiding light for its interpretation. The soul of the constitutional text.',
    },
  },
];

const SLIDE_INTERVAL_MS = 6000;

export default function LoginPage() {
  const [slideIdx, setSlideIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);

  // Auto-advance slideshow (paused while the summary is expanded)
  useEffect(() => {
    if (expanded) return;
    const timer = setInterval(() => {
      setSlideIdx(i => (i + 1) % SLIDES.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [expanded]);

  // Collapse when slide changes
  useEffect(() => {
    setExpanded(false);
  }, [slideIdx]);

  // Escape to collapse the summary
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded]);

  const current = SLIDES[slideIdx];

  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row"
      style={{ backgroundColor: '#050d1f' }}
    >
      {/* ─── LEFT: Slideshow (60%) ────────────────────────────── */}
      <div
        className="relative overflow-hidden hidden lg:block"
        style={{ width: '60%', minHeight: '100vh' }}
      >
        {/* Stacked slide images with crossfade */}
        {SLIDES.map((slide, i) => (
          <div
            key={slide.image}
            className="absolute inset-0 transition-opacity duration-[1500ms] ease-in-out"
            style={{
              opacity: i === slideIdx ? 1 : 0,
              backgroundImage: `url("${slide.image}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'top center',
              transform: i === slideIdx ? 'scale(1.04)' : 'scale(1)',
              transition:
                'opacity 1500ms ease-in-out, transform 6000ms ease-out',
            }}
          />
        ))}

        {/* Dark navy gradient overlay for legibility */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, rgba(5,13,31,0.55) 0%, rgba(5,13,31,0.35) 40%, rgba(5,13,31,0.85) 100%)',
          }}
        />

        {/* Top-left brand watermark */}
        <div className="absolute top-8 left-8 flex items-center gap-2 z-10">
          <Scale size={20} style={{ color: '#d4a017' }} />
          <span
            className="text-sm font-semibold tracking-widest uppercase"
            style={{ color: '#f0c040', letterSpacing: '0.2em' }}
          >
            MiniHarvey
          </span>
        </div>

        {/* Bottom-left caption card — click to expand summary */}
        <div className="absolute bottom-12 left-8 right-24 z-10">
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            aria-expanded={expanded}
            key={slideIdx}
            className="max-w-xl w-full text-left p-6 rounded-lg backdrop-blur-md animate-[fadeInUp_600ms_ease-out] cursor-pointer transition-all duration-300 hover:border-[rgba(212,160,23,0.55)]"
            style={{
              backgroundColor: 'rgba(10,22,40,0.88)',
              border: '1px solid rgba(212,160,23,0.25)',
              borderLeft: '3px solid #d4a017',
            }}
          >
            {current.court && (
              <span
                className="inline-block mb-3 px-2.5 py-1 rounded text-[10px] uppercase tracking-widest"
                style={{
                  backgroundColor: 'rgba(212,160,23,0.12)',
                  border: '1px solid rgba(212,160,23,0.35)',
                  color: '#f0c040',
                  letterSpacing: '0.18em',
                }}
              >
                {current.court}
              </span>
            )}
            <p
              className="text-xs uppercase tracking-widest mb-2"
              style={{ color: '#d4a017', letterSpacing: '0.2em' }}
            >
              {current.citation}
            </p>
            <h2
              className="text-2xl font-semibold mb-2 leading-tight"
              style={{
                color: '#f3f4f6',
                fontFamily: 'Georgia, "Times New Roman", serif',
              }}
            >
              {current.title}
            </h2>
            <p
              className="text-sm italic"
              style={{ color: '#d1d5db', fontFamily: 'Georgia, serif' }}
            >
              "{current.legacy}"
            </p>

            {/* Expanded summary */}
            {expanded && (
              <div
                className="mt-4 pt-4 animate-[fadeInUp_300ms_ease-out]"
                style={{ borderTop: '1px solid rgba(212,160,23,0.2)' }}
              >
                {current.summary.bench && (
                  <p
                    className="text-[11px] uppercase tracking-widest mb-3"
                    style={{ color: '#d4a017', letterSpacing: '0.2em' }}
                  >
                    {current.summary.bench}
                  </p>
                )}
                <p
                  className="text-xs uppercase tracking-wider mb-1"
                  style={{ color: '#9ca3af', letterSpacing: '0.15em' }}
                >
                  Holding
                </p>
                <p
                  className="text-sm leading-relaxed mb-3"
                  style={{ color: '#e5e7eb', fontFamily: 'Georgia, serif' }}
                >
                  {current.summary.holding}
                </p>
                <p
                  className="text-xs uppercase tracking-wider mb-1"
                  style={{ color: '#9ca3af', letterSpacing: '0.15em' }}
                >
                  Significance
                </p>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: '#e5e7eb', fontFamily: 'Georgia, serif' }}
                >
                  {current.summary.significance}
                </p>
              </div>
            )}

            {/* Read-more indicator */}
            <div
              className="flex items-center gap-1 mt-3 text-[11px] uppercase tracking-widest"
              style={{ color: '#d4a017', letterSpacing: '0.2em' }}
            >
              <span>{expanded ? 'Hide summary' : 'Read summary'}</span>
              <ChevronDown
                size={12}
                className="transition-transform duration-300"
                style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}
              />
            </div>
          </button>

          {/* Dot navigation */}
          <div className="flex items-center gap-2 mt-4 ml-2">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlideIdx(i)}
                aria-label={`Go to slide ${i + 1}`}
                className="transition-all duration-300 cursor-pointer border-0 p-0"
                style={{
                  width: i === slideIdx ? '24px' : '6px',
                  height: '6px',
                  borderRadius: '3px',
                  backgroundColor:
                    i === slideIdx ? '#d4a017' : 'rgba(255,255,255,0.3)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Bottom-right attribution */}
        <p
          className="absolute bottom-3 right-4 text-xs z-10"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          Images: Wikimedia Commons · CC BY-SA 4.0
        </p>
      </div>

      {/* ─── RIGHT: Sign-in card (40%) ────────────────────────── */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative"
        style={{ backgroundColor: '#050d1f' }}
      >
        {/* Ashoka Chakra watermark — 24-spoke Dharma Chakra (behind card) */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ opacity: 0.06 }}
          aria-hidden
        >
          <svg viewBox="0 0 100 100" width="560" height="560">
            {/* Outer rim (double ring) */}
            <circle cx="50" cy="50" r="48" fill="none" stroke="#d4a017" strokeWidth="0.6" />
            <circle cx="50" cy="50" r="46" fill="none" stroke="#d4a017" strokeWidth="1.2" />
            <circle cx="50" cy="50" r="44" fill="none" stroke="#d4a017" strokeWidth="0.4" />

            {/* 24 spokes + tip ornaments + rim dots */}
            {Array.from({ length: 24 }).map((_, i) => {
              const angle = (i * 15 * Math.PI) / 180;
              const cos = Math.cos(angle);
              const sin = Math.sin(angle);

              // Spoke endpoints
              const x1 = 50 + 8 * cos;
              const y1 = 50 + 8 * sin;
              const x2 = 50 + 43 * cos;
              const y2 = 50 + 43 * sin;

              // Tip diamond ornament — four points around the spoke tip
              const tipCx = 50 + 40 * cos;
              const tipCy = 50 + 40 * sin;
              const perpCos = Math.cos(angle + Math.PI / 2);
              const perpSin = Math.sin(angle + Math.PI / 2);
              const tipPath = [
                `M ${tipCx + 3 * cos} ${tipCy + 3 * sin}`,
                `L ${tipCx + 1.2 * perpCos} ${tipCy + 1.2 * perpSin}`,
                `L ${tipCx - 3 * cos} ${tipCy - 3 * sin}`,
                `L ${tipCx - 1.2 * perpCos} ${tipCy - 1.2 * perpSin}`,
                'Z',
              ].join(' ');

              // Rim dot between every spoke (at +7.5°)
              const betweenAngle = ((i * 15 + 7.5) * Math.PI) / 180;
              const dotX = 50 + 46 * Math.cos(betweenAngle);
              const dotY = 50 + 46 * Math.sin(betweenAngle);

              return (
                <g key={i}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#d4a017"
                    strokeWidth="0.7"
                    strokeLinecap="round"
                  />
                  <path d={tipPath} fill="#d4a017" opacity="0.85" />
                  <circle cx={dotX} cy={dotY} r="0.4" fill="#d4a017" />
                </g>
              );
            })}

            {/* Central hub */}
            <circle cx="50" cy="50" r="7.5" fill="none" stroke="#d4a017" strokeWidth="1" />
            <circle cx="50" cy="50" r="5" fill="#d4a017" opacity="0.25" />
            <circle cx="50" cy="50" r="2" fill="#d4a017" />
          </svg>
        </div>

        {/* Brand + sign-in */}
        <div className="relative z-10 w-full max-w-md flex flex-col items-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
            style={{
              backgroundColor: '#0a1628',
              border: '2px solid #d4a017',
            }}
          >
            <Scale size={28} style={{ color: '#d4a017' }} />
          </div>

          <h1
            className="text-3xl font-bold tracking-tight mb-1"
            style={{
              color: '#f0c040',
              fontFamily: 'Georgia, "Times New Roman", serif',
            }}
          >
            MiniHarvey
          </h1>
          <div
            className="w-12 h-px my-3"
            style={{ backgroundColor: '#d4a017' }}
          />
          <p className="text-sm text-center" style={{ color: '#9ca3af' }}>
            Indian Legal Research, Powered by AI
          </p>

          {/* Clerk sign-in widget */}
          <div className="mt-8 w-full flex justify-center clerk-wrapper">
            <SignIn
              appearance={{
                elements: {
                  rootBox: 'mx-auto w-full',
                  card: 'shadow-none bg-transparent border-0 p-0',
                  header: 'hidden',
                  headerTitle: 'hidden',
                  headerSubtitle: 'hidden',
                  socialButtonsBlockButton:
                    'bg-[#112040] border border-[#1a3060] text-[#f3f4f6] hover:bg-[#1a3060] transition-colors',
                  socialButtonsBlockButtonText: 'text-[#f3f4f6] font-medium',
                  socialButtonsProviderIcon: 'brightness-110',
                  dividerLine: 'bg-[#1a3060]',
                  dividerText: 'text-[#6b7280]',
                  formFieldLabel: 'text-[#d1d5db] font-medium',
                  formFieldInput:
                    'bg-[#112040] border border-[#1a3060] text-[#f3f4f6] focus:border-[#d4a017]',
                  formButtonPrimary:
                    'bg-[#d4a017] hover:bg-[#b8860b] text-[#050d1f] font-semibold',
                  footerActionText: 'text-[#9ca3af]',
                  footerActionLink: 'text-[#d4a017] hover:text-[#f0c040]',
                  identityPreviewText: 'text-[#f3f4f6]',
                  identityPreviewEditButton: 'text-[#d4a017]',
                  formResendCodeLink: 'text-[#d4a017]',
                  otpCodeFieldInput: 'bg-[#112040] border-[#1a3060] text-[#f3f4f6]',
                  badge: 'bg-[#1a3060] text-[#f0c040]',
                  formFieldSuccessText: 'text-[#10b981]',
                  formFieldErrorText: 'text-[#ef4444]',
                  alertText: 'text-[#f3f4f6]',
                },
                layout: {
                  socialButtonsVariant: 'blockButton',
                  socialButtonsPlacement: 'top',
                },
              }}
            />
          </div>

          {/* Disclaimer */}
          <p
            className="text-xs text-center mt-8 max-w-sm leading-relaxed"
            style={{ color: '#6b7280' }}
          >
            ⚖️ MiniHarvey provides legal information only — not legal advice.
            For your specific situation, consult a qualified advocate registered
            with the <span style={{ color: '#d4a017' }}>Bar Council of India</span>.
          </p>

          {/* Satyameva Jayate footer */}
          <p
            className="text-xs mt-6 tracking-widest"
            style={{
              color: '#d4a017',
              fontFamily: 'Georgia, serif',
              letterSpacing: '0.3em',
            }}
          >
            सत्यमेव जयते
          </p>

          {/* Developer credit */}
          <a
            href="https://paritoshdev.netlify.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-1.5 text-[11px] no-underline transition-colors"
            style={{ color: '#6b7280', letterSpacing: '0.05em' }}
            title="Built by Paritosh Tripathi"
          >
            Built by{' '}
            <span
              style={{
                color: '#d4a017',
                fontFamily: 'Georgia, serif',
                fontWeight: 600,
              }}
            >
              Paritosh Tripathi
            </span>
            <ExternalLink size={10} style={{ color: '#6b7280' }} />
          </a>
        </div>
      </div>

      {/* Keyframes for caption fade-in */}
      <style>
        {`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(12px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>
    </div>
  );
}
