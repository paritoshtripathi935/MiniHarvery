/**
 * LandingPage — public marketing page (PAI-39), built from the final Stitch
 * design "Vidhi - 3-Tier Beta Pricing Update".
 *
 * Rendered in the <SignedOut> branch of App; every CTA flips to <LoginPage>
 * (the Clerk sign-in surface). The light "Paper" palette is forced via a
 * scoped data-theme so the page reads identically whatever the stored theme.
 */
import { useState, type ReactNode } from 'react';
import {
  Scale, Search, ChevronRight, CheckCircle2, FilePenLine, Table2, FolderOpen,
  Download, FileText, Lock, Send, LayoutDashboard, Settings, ExternalLink,
} from 'lucide-react';
import LoginPage from '../components/LoginPage';
import { t } from '../design/tokens';

const serif = { fontFamily: t.font.serif };
const mono = { fontFamily: t.font.mono };
const gold = { color: t.color.accent };
const muted = { color: t.color.muted };
const dim = { color: t.color.dim };
const hairline = '1px solid var(--border-subtle)';
const card = { background: t.color.surface, border: hairline };
const goldTint = `color-mix(in srgb, ${t.color.accent} 8%, transparent)`;
const glow = (pct: string) =>
  `radial-gradient(circle at center, ${t.color.accentSoft} 0%, transparent ${pct})`;

const COURTS = ['SUPREME COURT', 'DELHI HC', 'BOMBAY HC', 'MADRAS HC', 'CALCUTTA HC'];
const STEPS = [
  ['01', 'Ask', 'Query concepts or upload facts.'],
  ['02', 'Get Brief', 'Receive structured analysis.'],
  ['03', 'Pin & Draft', 'Export TOA or generate drafts.'],
];
const FAQS = [
  ['Is Vidhi really free?', 'Yes — full access is free during our public beta.'],
  ['Is this legal advice?', 'No. Vidhi provides legal information to speed your research; consult an advocate for advice on your matter.'],
  ['Which courts and sources are covered?', 'Indian Kanoon, India Code, Google and YouTube — Supreme Court and High Court judgments, bare acts and more.'],
  ['Are the citations reliable?', 'Only well-formed AIR/SCC/Section/Article references are surfaced; Vidhi never invents citations.'],
  ['Is my data private?', 'Your matters, briefs and drafts are private to your account.'],
  ['What can I do with it?', 'Research briefs, draft pleadings, and build a Table of Authorities — in one workspace.'],
];
const TIERS = [
  { name: 'Student', planned: '~₹299/mo', blurb: 'For law students.', popular: false,
    perks: ['Research briefs', 'Save matters', 'Export to PDF'] },
  { name: 'Advocate', planned: '~₹999/mo', blurb: 'For solo practitioners.', popular: true,
    perks: ['Everything in Student', 'Drafting Workshop', 'Authorities Table & ToA', 'All Indian sources'] },
  { name: 'Firm', planned: '~₹2,499/mo', blurb: 'For chambers & teams.', popular: false,
    perks: ['Everything in Advocate', 'Shared matters', 'Priority support (soon)'] },
];
/* Curved connector traced behind the How-It-Works steps (01 → 02 → 03) */
const TRACK = 'M0 32 C 250 -8, 750 72, 1000 32';
const FOOTER: [string, string[]][] = [
  ['Product', ['Features', 'Pricing', 'Case Studies']],
  ['Company', ['About', 'Blog', 'Contact']],
  ['Legal', ['Privacy Policy', 'Terms of Service']],
];

/* ── tiny building blocks ─────────────────────────────────────── */

function GoldBtn({ onClick, className = '', children }:
  { onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded-full font-semibold cursor-pointer inline-flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-all ${className}`}
      style={{ background: t.color.accent, color: t.color.surface, boxShadow: `0 0 20px ${t.color.accentSoft}` }}>
      {children}
    </button>
  );
}

const Eyebrow = ({ children, pill = false }: { children: ReactNode; pill?: boolean }) => (
  <span className={`inline-block text-xs uppercase mb-4 ${pill ? 'px-4 py-1.5 rounded-full' : ''}`}
    style={{ ...mono, ...gold, letterSpacing: '0.2em', border: pill ? `1px solid ${t.color.accentSoft}` : undefined }}>
    {children}
  </span>
);

const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="text-2xl md:text-[32px] font-semibold leading-tight" style={serif}>{children}</h2>
);

const Chip = ({ children, sm = false }: { children: ReactNode; sm?: boolean }) => (
  <span className={`rounded whitespace-nowrap ${sm ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[13px]'}`}
    style={{ ...mono, ...gold, background: goldTint, border: `1px solid ${t.color.accentSoft}` }}>
    {children}
  </span>
);

const Label = ({ children, accent = false }: { children: ReactNode; accent?: boolean }) => (
  <p className="text-[10px] uppercase mb-3"
    style={{ ...mono, letterSpacing: '0.15em', color: accent ? t.color.accent : t.color.dim }}>
    {children}
  </p>
);

const Check = ({ children }: { children: ReactNode }) => (
  <li className="flex items-center gap-2 text-sm" style={muted}>
    <CheckCircle2 size={15} className="flex-shrink-0" style={gold} /> {children}
  </li>
);

const Bar = ({ w = '100%' }: { w?: string }) => (
  <div className="h-1.5 rounded-full" style={{ width: w, background: 'var(--surface-hover)' }} />
);

const Tag = ({ children }: { children: ReactNode }) => (
  <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--surface-hover)', ...muted }}>{children}</span>
);

const Ribbon = () => (
  <div className="absolute top-4 right-[-35px] rotate-45 text-[10px] font-bold py-1 px-10 shadow-sm"
    style={{ background: t.color.accent, color: t.color.surface }}>
    FREE IN BETA
  </div>
);

/* ── page ─────────────────────────────────────────────────────── */

export default function LandingPage() {
  const [signIn, setSignIn] = useState(false);
  if (signIn) return <LoginPage />;
  const go = () => setSignIn(true);

  return (
    <div data-theme="light" className="min-h-screen"
      style={{ background: t.color.bg, color: t.color.text, fontFamily: t.font.sans }}>

      {/* Top nav */}
      <nav className="fixed top-0 left-0 w-full z-50 backdrop-blur-xl"
        style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)', borderBottom: hairline }}>
        <div className="max-w-[1200px] mx-auto flex items-center justify-between px-4 md:px-12 py-4">
          <span className="flex items-center gap-2" style={serif}>
            <Scale size={24} style={gold} />
            <span className="text-2xl font-bold tracking-tight">Vidhi</span>
          </span>
          <div className="hidden md:flex items-center gap-8 text-[13px] font-medium">
            {[['Features', '#features'], ['How it works', '#how'], ['Pricing', '#pricing']].map(([l, h]) => (
              <a key={l} href={h} className="hover:opacity-70 transition-opacity" style={dim}>{l}</a>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <button onClick={go} className="hidden md:block text-[13px] font-medium cursor-pointer"
              style={{ color: t.color.text }}>
              Sign in
            </button>
            <GoldBtn onClick={go} className="px-7 py-2.5 text-[13px]">Get started</GoldBtn>
          </div>
        </div>
      </nav>

      <main className="px-4 md:px-12">
        {/* Hero */}
        <section className="flex flex-col items-center text-center pt-[160px] pb-20 md:pb-28">
          <Eyebrow pill>Elevate Your Legal Practice</Eyebrow>
          <h1 className="text-[34px] leading-[1.15] md:text-[48px] font-bold mb-6 max-w-[850px]" style={serif}>
            Precision Legal Research,<br className="hidden md:block" /> Powered by Intelligence.
          </h1>
          <p className="text-lg md:text-xl leading-relaxed mb-10 max-w-[650px]" style={muted}>
            Navigate complex jurisprudence with unprecedented clarity. Vidhi transforms raw
            data into structured, actionable insights for the modern practitioner.
          </p>
          <div className="w-full max-w-[700px]">
            <div className="flex flex-col sm:flex-row gap-2 p-1.5 rounded-3xl sm:rounded-full shadow-lg" style={card}>
              <div className="relative flex-grow flex items-center">
                <Search size={20} className="absolute left-5" style={dim} />
                <input
                  className="w-full pl-14 pr-4 py-4 bg-transparent border-none outline-none text-base placeholder:opacity-60"
                  style={{ color: t.color.text }}
                  placeholder="Search case law, statutes, or concepts..."
                  onKeyDown={e => e.key === 'Enter' && go()}
                />
              </div>
              <GoldBtn onClick={go} className="px-8 py-4 text-base whitespace-nowrap">
                Start Research <ChevronRight size={18} />
              </GoldBtn>
            </div>
            <p className="mt-4 text-sm" style={dim}>Free to start · No card required · Ask in plain English</p>
          </div>
        </section>

        {/* Trust strip */}
        <div className="text-center mb-24 md:mb-32">
          <p className="text-xs uppercase tracking-wider mb-4" style={dim}>Trusted by advocates researching across</p>
          <p className="text-sm opacity-70" style={{ ...mono, ...muted }}>{COURTS.join('  ·  ')}</p>
        </div>

        {/* Product showcase */}
        <section className="relative w-full max-w-[1000px] mx-auto mb-24 md:mb-32">
          <div className="absolute inset-0 -z-10 blur-3xl opacity-50" style={{ background: glow('70%') }} />
          <div className="rounded-xl overflow-hidden shadow-2xl" style={card}>
            <div className="flex items-center px-4 py-3" style={{ background: t.color.raised, borderBottom: hairline }}>
              <div className="flex gap-2 mr-4">
                {[0, 1, 2].map(i => <span key={i} className="w-3 h-3 rounded-full" style={{ background: t.color.border }} />)}
              </div>
              <div className="flex-grow flex justify-center">
                <span className="flex items-center gap-2 px-4 py-1 rounded text-xs" style={{ ...mono, ...dim, background: t.color.surface, border: hairline }}>
                  <Lock size={11} /> app.vidhilegal.com/workspace
                </span>
              </div>
            </div>
            <div className="flex h-[420px] md:h-[560px]">
              <div className="hidden md:block w-[260px] flex-shrink-0 p-6 text-left" style={{ background: t.color.raised, borderRight: hairline }}>
                <Label>Current Brief</Label>
                <div className="p-3 rounded text-sm mb-8" style={{ ...mono, background: t.color.surface, border: hairline }}>
                  Nathulal v. State of M.P.
                </div>
                <Label>Citations</Label>
                <ul className="space-y-2 text-sm" style={mono}>
                  {['AIR 1966 SC 43', '1966 Cri LJ 71', 'S. 45, Evidence Act'].map(c => (
                    <li key={c} className="flex items-center gap-2 p-2"><FileText size={14} style={gold} />{c}</li>
                  ))}
                </ul>
              </div>
              <div className="flex-grow p-6 md:p-12 overflow-hidden text-left">
                <h2 className="text-xl md:text-2xl font-semibold pb-4 mb-6" style={{ ...serif, borderBottom: hairline }}>
                  Analysis: Mens Rea in Statutory Offences
                </h2>
                <p className="text-base md:text-lg leading-relaxed mb-6" style={muted}>
                  The central question revolves around the requisite intent necessary to establish
                  liability under the newly enacted provision. As observed in <Chip>Nathulal v. State of M.P.</Chip>,
                  the presumption of mens rea is deeply embedded in our jurisprudence, unless
                  explicitly ousted by statutory language.
                </p>
                <p className="text-base md:text-lg leading-relaxed" style={muted}>
                  Furthermore, the legislative history suggests a clear intent to target{' '}
                  <span className="font-medium" style={{ borderBottom: `1px dashed ${t.color.accent}`, color: t.color.text }}>
                    willful misconduct
                  </span>{' '}
                  rather than inadvertent omissions, a point critical to distinguishing the present
                  facts from the precedent established in prior appellate rulings.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities bento */}
        <section id="features" className="relative max-w-[1200px] mx-auto mb-24 md:mb-32 scroll-mt-24">
          <div className="absolute inset-0 -z-10 blur-2xl opacity-40" style={{ background: glow('80%') }} />
          <div className="text-center mb-12">
            <Eyebrow>Capabilities</Eyebrow>
            <H2>Everything you need to build your case.</H2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 [&>div]:p-6 [&>div]:rounded-xl [&>div]:shadow-sm [&>div]:transition-transform [&>div:hover]:-translate-y-1">
            <div className="md:col-span-2 md:row-span-2 relative overflow-hidden flex flex-col" style={{ ...card, padding: t.space.lg }}>
              <h3 className="text-xl font-semibold mb-3" style={serif}>Structured Briefs</h3>
              <Label accent>Issue</Label>
              <p className="text-sm leading-relaxed mb-4" style={muted}>
                Whether the right to privacy under Article 21 extends to digital communications
                in the context of state surveillance without judicial oversight.
              </p>
              <div className="pl-4 mb-6" style={{ borderLeft: `2px solid ${t.color.accent}` }}>
                <p className="text-sm font-medium">Conclusion: Privacy is an intrinsic part of the right to life and personal liberty.</p>
              </div>
              <div className="flex flex-wrap gap-2 mt-auto">
                {['AIR 1973 SC 1461', 'Art. 21', '§ 138'].map(c => <Chip key={c} sm>{c}</Chip>)}
              </div>
            </div>
            <div className="md:col-span-2" style={card}>
              <div className="flex items-center gap-3 mb-4">
                <FilePenLine size={20} style={gold} />
                <h3 className="text-lg font-semibold" style={serif}>Drafting Workshop</h3>
              </div>
              <p className="text-sm leading-relaxed" style={muted}>
                Plaint, Writ (Art. 226), Anticipatory Bail (CrPC s.438), Legal Notice.
              </p>
            </div>
            <div className="flex flex-col justify-between" style={card}>
              <div>
                <h3 className="text-lg font-semibold mb-2" style={serif}>Authorities Table</h3>
                <ul className="text-sm space-y-1" style={dim}><li>• Pin cases</li><li>• Export TOA</li></ul>
              </div>
              <Table2 size={30} className="mt-4 opacity-50" style={gold} />
            </div>
            <div style={card}>
              <h3 className="text-lg font-semibold mb-2" style={serif}>Live Sources</h3>
              <div className="flex flex-wrap gap-2">
                {['Indian Kanoon', 'India Code', 'Google'].map(s => <Tag key={s}>{s}</Tag>)}
              </div>
            </div>
            <div className="flex flex-col items-center justify-center text-center" style={card}>
              <FolderOpen size={22} className="mb-2" style={gold} />
              <h3 className="text-lg font-semibold" style={serif}>Matters</h3>
              <p className="text-xs mt-1" style={dim}>Cases & drafts in one file</p>
            </div>
            <div className="flex flex-col items-center justify-center text-center" style={card}>
              <Download size={22} className="mb-2" style={gold} />
              <h3 className="text-lg font-semibold" style={serif}>Export</h3>
              <p className="text-xs mt-1" style={dim}>Markdown + PDF</p>
            </div>
            <div className="md:col-span-3 flex items-center justify-between overflow-hidden" style={card}>
              <h3 className="text-lg font-semibold whitespace-nowrap mr-4" style={serif}>Citations you can trust</h3>
              <div className="flex gap-2 opacity-70 overflow-x-auto">
                {['AIR', 'SCC', 'Section', 'Article'].map(c => (
                  <span key={c} className="text-xs px-2 py-1 rounded whitespace-nowrap" style={{ ...mono, background: 'var(--surface-hover)' }}>{c}</span>
                ))}
              </div>
            </div>
            <div className="flex flex-col justify-center" style={card}>
              <h3 className="text-lg font-semibold mb-3" style={serif}>Light & Dark</h3>
              <div className="flex gap-2">
                <span data-theme="dark" title="Chambers (Navy)" className="w-8 h-8 rounded-full" style={{ background: 'var(--bg)', border: hairline }} />
                <span data-theme="light" title="Paper (Cream)" className="w-8 h-8 rounded-full" style={{ background: 'var(--bg)', border: `1px solid ${t.color.border}` }} />
              </div>
            </div>
          </div>
        </section>

        {/* How it feels */}
        <section className="max-w-[1200px] mx-auto mb-24 md:mb-32">
          <div className="text-center mb-12"><Eyebrow>How It Feels</Eyebrow></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-24">
            <div className="order-2 md:order-1 h-[300px] rounded-xl shadow-lg p-4 flex gap-3" style={card}>
              <div className="w-12 flex flex-col items-center py-4 gap-6 rounded-lg flex-shrink-0" style={{ background: t.color.raised, border: hairline }}>
                <LayoutDashboard size={18} style={dim} />
                <FileText size={18} style={gold} />
                <Search size={18} style={dim} />
                <Settings size={18} style={dim} />
              </div>
              <div className="flex-grow rounded-lg p-4 overflow-hidden" style={{ background: t.color.surface, border: hairline }}>
                <Label accent>Governing Law</Label>
                <div className="space-y-2 mb-4"><Bar /><Bar w="83%" /></div>
                <Label accent>Authorities</Label>
                <div className="flex flex-wrap gap-2">
                  <Chip sm>[2023] SC 45</Chip><Chip sm>Art. 14</Chip>
                </div>
              </div>
              <div className="w-1/3 flex flex-col gap-2 flex-shrink-0">
                {['Indian Kanoon', 'India Code'].map(s => (
                  <div key={s} className="p-2 rounded shadow-sm" style={card}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[8px] font-bold uppercase tracking-wider" style={gold}>{s}</span>
                      <ExternalLink size={9} style={dim} />
                    </div>
                    <div className="space-y-1"><Bar /><Bar w="60%" /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="order-1 md:order-2">
              <h3 className="text-2xl font-semibold mb-4" style={serif}>From question to cited memo in seconds.</h3>
              <p className="mb-6" style={muted}>
                Experience a fluid research flow that builds your brief as you explore,
                seamlessly connecting queries to authoritative sources.
              </p>
              <ul className="space-y-3">
                {['Streaming analysis', 'Instant citation links', 'Multi-pane context'].map(f => <Check key={f}>{f}</Check>)}
              </ul>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-2xl font-semibold mb-4" style={serif}>Draft the document you actually file.</h3>
              <p className="mb-6" style={muted}>
                Transition seamlessly from research to drafting with context-aware templates
                that integrate your gathered authorities.
              </p>
              <ul className="space-y-3">
                {['Conversational builder', 'Compliance checklists', 'Court-ready formats'].map(f => <Check key={f}>{f}</Check>)}
              </ul>
            </div>
            <div className="h-[300px] rounded-xl shadow-lg p-5 flex gap-5 overflow-hidden" style={card}>
              <div className="flex-grow flex flex-col gap-3 min-w-0">
                <div className="self-end p-3 rounded-lg rounded-tr-none max-w-[80%] text-[11px] leading-relaxed" style={{ background: goldTint, ...muted }}>
                  Draft a SLP challenging the High Court order on interim maintenance.
                </div>
                <div className="self-start p-3 rounded-lg rounded-tl-none max-w-[80%] text-[11px] leading-relaxed" style={{ background: t.color.raised, border: hairline, ...muted }}>
                  I've analyzed the case file. I'll extract the key dates and parties to begin the draft.
                </div>
                <div className="mt-auto pt-3 flex items-center gap-2" style={{ borderTop: hairline }}>
                  <div className="flex-grow h-8 rounded-full px-3 flex items-center text-[10px]" style={{ background: t.color.raised, border: hairline, ...dim }}>
                    Type a message...
                  </div>
                  <Send size={16} style={gold} />
                </div>
              </div>
              <div className="w-1/3 pl-5 flex flex-col flex-shrink-0" style={{ borderLeft: hairline }}>
                <Label>Extracted Fields</Label>
                <ul className="space-y-3 [&>li]:text-[11px]">
                  {['Petitioner Name', 'Jurisdiction', 'Date of Incident'].map(f => <Check key={f}>{f}</Check>)}
                </ul>
                <GoldBtn onClick={go} className="mt-auto w-full py-2 text-[10px]">
                  <FilePenLine size={11} /> Generate Draft
                </GoldBtn>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="max-w-[1200px] mx-auto mb-24 md:mb-32 rounded-2xl p-8 md:p-12 scroll-mt-24"
          style={{ background: t.color.raised, border: hairline }}>
          <div className="text-center mb-12"><H2>How It Works</H2></div>
          <div className="relative flex flex-col md:flex-row justify-between items-center gap-8">
            <svg className="hidden md:block absolute top-0 left-[10%] w-[80%] h-16" viewBox="0 0 1000 64"
              fill="none" preserveAspectRatio="none" aria-hidden>
              <path d={TRACK} stroke="var(--border)" strokeWidth="1.5" strokeDasharray="2 7" />
              <path d={TRACK} className="track-draw" stroke={t.color.accent} strokeWidth="1.5"
                strokeOpacity="0.7" pathLength={1} strokeDasharray="1" strokeDashoffset="1" />
            </svg>
            {STEPS.map(([n, h, p]) => (
              <div key={n} className="relative flex flex-col items-center text-center px-4" style={{ background: t.color.raised }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                  style={{ background: t.color.surface, border: `2px solid ${t.color.accent}` }}>
                  <span className="text-xl" style={{ ...mono, ...gold }}>{n}</span>
                </div>
                <h3 className="text-lg font-semibold mb-2" style={serif}>{h}</h3>
                <p className="text-sm" style={dim}>{p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Differentiator band */}
        <section className="relative max-w-[1200px] mx-auto mb-24 md:mb-32 text-center py-16 px-4 rounded-2xl overflow-hidden shadow-sm" style={card}>
          <div className="absolute inset-0 opacity-40 pointer-events-none" style={{ background: glow('70%') }} />
          <div className="relative">
            <H2>No invented citations. Ever.</H2>
            <p className="max-w-[600px] mx-auto mt-4 mb-8 leading-relaxed" style={muted}>
              Every AIR, SCC, Section and Article is extracted from real sources and
              verifiable — and your matters stay private.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {['AIR 1973 SC 1461', '(2017) 10 SCC 1', 'Art. 21', '§ 138'].map(c => <Chip key={c}>{c}</Chip>)}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-[1200px] mx-auto mb-24 md:mb-32">
          <div className="text-center mb-12">
            <Eyebrow>FAQ</Eyebrow>
            <H2>Questions, answered.</H2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
            {FAQS.map(([q, a]) => (
              <div key={q} className="pb-6" style={{ borderBottom: hairline }}>
                <h3 className="text-lg font-semibold mb-2" style={serif}>{q}</h3>
                <p className="text-sm leading-relaxed" style={muted}>{a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="relative max-w-[1200px] mx-auto mb-24 md:mb-32 scroll-mt-24">
          <div className="absolute inset-0 -z-10 blur-2xl opacity-40" style={{ background: glow('80%') }} />
          <div className="text-center mb-12">
            <Eyebrow>Pricing</Eyebrow>
            <H2>Free while we're in beta.</H2>
            <p className="max-w-[600px] mx-auto mt-4" style={dim}>
              Every plan is free during the public beta — pricing below is indicative for
              when we launch. Early users keep beta perks.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch mb-10">
            {TIERS.map(tier => (
              <div key={tier.name} className="relative overflow-hidden rounded-2xl p-8 flex flex-col"
                style={{
                  background: t.color.surface,
                  border: tier.popular ? `2px solid ${t.color.accent}` : hairline,
                  boxShadow: tier.popular ? `0 0 30px ${t.color.accentSoft}` : undefined,
                }}>
                <Ribbon />
                {tier.popular && (
                  <span className="self-start mb-4 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: t.color.accent, color: t.color.surface }}>
                    Most popular
                  </span>
                )}
                <h3 className="text-xl font-semibold mb-2" style={serif}>{tier.name}</h3>
                <p className="text-sm line-through" style={dim}>planned {tier.planned}</p>
                <div className="text-3xl font-bold mb-2" style={{ ...serif, ...gold }}>₹0 now</div>
                <p className="text-sm mb-6" style={dim}>{tier.blurb}</p>
                <ul className="space-y-3 mb-8 flex-grow">{tier.perks.map(p => <Check key={p}>{p}</Check>)}</ul>
                {tier.popular ? (
                  <GoldBtn onClick={go} className="w-full py-3 text-[13px]">Start free</GoldBtn>
                ) : (
                  <button onClick={go}
                    className="w-full py-3 rounded-full text-[13px] font-semibold cursor-pointer hover:opacity-75 transition-opacity"
                    style={{ border: `1px solid ${t.color.accent}`, ...gold, background: 'transparent' }}>
                    Start free
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-sm" style={dim}>
            Prices are indicative and not final. Nothing to pay during beta — no card required.
          </p>
        </section>

        {/* Closing CTA */}
        <section className="relative max-w-[1200px] mx-auto mb-24 text-center py-20 px-4 rounded-2xl shadow-sm overflow-hidden"
          style={{ background: t.color.raised, border: hairline }}>
          <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ background: glow('60%') }} />
          <div className="relative">
            <div className="mb-8"><H2>Begin your research.</H2></div>
            <GoldBtn onClick={go} className="px-10 py-4 text-base mx-auto">
              Start Research <ChevronRight size={18} />
            </GoldBtn>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="pt-16 pb-8" style={{ background: t.color.surface, borderTop: hairline }}>
        <div className="max-w-[1200px] mx-auto px-4 md:px-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4" style={serif}>
                <Scale size={20} style={gold} />
                <span className="text-xl font-bold tracking-tight">Vidhi</span>
              </div>
              <p className="text-xs" style={{ ...mono, ...gold }}>सत्यमेव जयते</p>
            </div>
            {FOOTER.map(([h, links]) => (
              <div key={h}>
                <h4 className="text-sm font-semibold uppercase tracking-wider mb-4">{h}</h4>
                <ul className="space-y-3 text-sm" style={muted}>
                  {links.map(l => <li key={l}><a href="#" className="hover:opacity-70 transition-opacity">{l}</a></li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs"
            style={{ borderTop: hairline, ...dim }}>
            <p>© 2026 Vidhi Legal Research. All rights reserved.</p>
            <p className="italic">Legal information, not legal advice.</p>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes track-draw { to { stroke-dashoffset: 0; } }
        .track-draw { animation: track-draw 1.4s ease-out 0.2s forwards; }
        @supports (animation-timeline: view()) {
          .track-draw { animation: track-draw linear both; animation-timeline: view(); animation-range: entry 30% cover 55%; }
        }
        @media (prefers-reduced-motion: reduce) { .track-draw { animation: none; stroke-dashoffset: 0; } }
      `}</style>
    </div>
  );
}
