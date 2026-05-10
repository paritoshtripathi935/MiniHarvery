/**
 * PrintPage — chrome-less route that renders a single markdown document
 * and triggers the OS print dialog. Bar advocates print-and-save to PDF
 * via that dialog; this avoids a server-side PDF dependency.
 *
 * Content arrives via `useLocation().state` ({ title, markdown }). Every
 * surface that wants to print serialises its own content first
 * (`utils/exportDocument`) and navigates here with state — that keeps
 * this page dumb and avoids an extra round-trip.
 *
 * Print stylesheet: hide the on-screen "Back" / "Print again" toolbar
 * during print; let only the article body through. Generous margins,
 * serif body, single-column.
 */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, Printer } from 'lucide-react';

interface PrintState {
  title: string;
  markdown: string;
}

export default function PrintPage() {
  const navigate = useNavigate();
  const state = useLocation().state as PrintState | null;

  // Auto-fire the print dialog once the content is in the DOM. A small
  // rAF delay lets ReactMarkdown settle so the print preview reflects
  // the rendered document, not the raw markdown skeleton.
  useEffect(() => {
    if (!state?.markdown) return;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
    return () => window.cancelAnimationFrame(id);
  }, [state?.markdown]);

  if (!state?.markdown) {
    return (
      <div style={{ padding: '48px', fontFamily: 'Georgia, serif' }}>
        <p>No document to print. Open a document and use the Print action.</p>
        <button onClick={() => navigate(-1)} style={linkStyle}>
          ← Go back
        </button>
      </div>
    );
  }

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="print-screen-toolbar no-print">
        <button onClick={() => navigate(-1)} style={toolbarBtn}>
          <ArrowLeft size={13} /> Back
        </button>
        <button onClick={() => window.print()} style={toolbarBtnPrimary}>
          <Printer size={13} /> Print / save as PDF
        </button>
      </div>
      <article className="print-document">
        <ReactMarkdown>{state.markdown}</ReactMarkdown>
      </article>
    </>
  );
}

const linkStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#b8860b',
  cursor: 'pointer',
  fontSize: '14px',
};

const toolbarBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  fontSize: '12px',
  background: 'transparent',
  border: '1px solid currentColor',
  borderRadius: '4px',
  color: '#666',
  cursor: 'pointer',
};

const toolbarBtnPrimary: React.CSSProperties = {
  ...toolbarBtn,
  background: '#1a1a1a',
  color: '#fff',
  borderColor: '#1a1a1a',
};

// Inlined so the page renders the same way regardless of what's loaded
// in index.css. The screen styles approximate the memo look; the print
// rules drop chrome and force a printer-friendly layout.
const PRINT_CSS = `
  @media screen {
    body { background: #f4f1ec; }
    .print-screen-toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      gap: 8px;
      padding: 12px 24px;
      background: #fff;
      border-bottom: 1px solid #e5e1d8;
    }
    .print-document {
      max-width: 720px;
      margin: 24px auto 64px;
      padding: 48px 56px;
      background: #fff;
      border: 1px solid #e5e1d8;
      border-radius: 4px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 14px;
      line-height: 1.7;
      color: #1a1a1a;
    }
    .print-document h1 {
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 24px;
      letter-spacing: -0.005em;
    }
    .print-document h2 {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      margin: 32px 0 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid #d8d2c5;
    }
    .print-document h3 { font-size: 14px; font-weight: 700; margin: 24px 0 8px; }
    .print-document p { margin: 0 0 14px; }
    .print-document ul, .print-document ol { margin: 0 0 14px 24px; padding: 0; }
    .print-document li { margin-bottom: 6px; }
    .print-document strong { font-weight: 700; }
    .print-document hr {
      border: none;
      border-top: 1px solid #d8d2c5;
      margin: 32px 0;
    }
    .print-document a { color: #b8860b; text-decoration: underline; }
  }

  @media print {
    .no-print, .print-screen-toolbar { display: none !important; }
    body { background: #fff; margin: 0; }
    .print-document {
      max-width: none;
      margin: 0;
      padding: 0;
      border: none;
      border-radius: 0;
      background: transparent;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 11pt;
      line-height: 1.55;
      color: #000;
    }
    .print-document h1 { font-size: 18pt; margin: 0 0 16pt; }
    .print-document h2 {
      font-size: 11pt;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      margin: 18pt 0 6pt;
      padding-bottom: 3pt;
      border-bottom: 0.5pt solid #000;
      page-break-after: avoid;
    }
    .print-document h3 { font-size: 11pt; font-weight: 700; margin: 12pt 0 4pt; }
    .print-document p, .print-document li { orphans: 3; widows: 3; }
    .print-document a { color: #000; text-decoration: none; }
    @page { margin: 18mm 16mm; }
  }
`;
