/*
 * Printable PDFs for the judges: a one-page scorecard per stall and an event summary.
 * jsPDF is loaded on demand. Its built-in font has no rupee sign, so amounts print as "Rs".
 */

const ORANGE = [217, 72, 15];
const INK = [43, 38, 35];
const MUTED = [122, 113, 106];
const SOFT = [253, 240, 231];

const rs = (n) => `Rs ${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const rs2 = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stamp = () => new Date().toISOString().slice(0, 10);
const fileSafe = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ordinal = (n) => (n ? `#${n}` : '-');

async function loadPdf() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  return { jsPDF, autoTable };
}

function header(doc, title, subtitle, period, event) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, W, 92, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text((event.name || 'DailyLedger').toUpperCase(), 40, 32);
  doc.setFontSize(24);
  doc.text(title, 40, 64);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(period, W - 40, 32, { align: 'right' });
  if (subtitle) doc.text(subtitle, W - 40, 50, { align: 'right' });
  doc.setTextColor(...INK);
}

function footer(doc, event) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`${event.tagline ? `${event.tagline}  |  ` : ''}Generated ${new Date().toLocaleString('en-IN')} by DailyLedger`, W / 2, H - 22, { align: 'center' });
}

function kpiBox(doc, x, y, w, label, value) {
  doc.setFillColor(...SOFT);
  doc.roundedRect(x, y, w, 56, 8, 8, 'F');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(label.toUpperCase(), x + 12, y + 18);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...INK);
  doc.text(String(value), x + 12, y + 41);
  doc.setFont('helvetica', 'normal');
}

/** A one-page summary of a single stall, built from /admin/scorecard/:id. */
export async function downloadScorecard(card) {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const m = card.metrics;

  header(doc, 'Stall scorecard', null, card.period, card.event);

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(card.stall.name, 40, 132);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  const who = [card.stall.owner_name, card.stall.phone].filter(Boolean).join('  |  ');
  if (who) doc.text(who, 40, 150);

  // Overall position badge
  doc.setFillColor(...ORANGE);
  doc.roundedRect(W - 150, 108, 110, 52, 10, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.text('OVERALL POSITION', W - 95, 126, { align: 'center' });
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(card.overall_rank ? `${ordinal(card.overall_rank)} of ${card.ranked_count}` : 'Not ranked', W - 95, 150, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...INK);

  const boxW = (W - 80 - 36) / 4;
  const boxes = [
    ['Revenue', rs(m.revenue)],
    ['Net profit', rs(m.net_profit)],
    ['Profit margin', `${m.margin_pct}%`],
    ['Orders', m.orders],
    ['Average order', rs2(m.avg_order)],
    ['Units sold', m.units_sold],
    ['Waste of stock bought', `${m.waste_pct}%`],
    ['Credit still owed', rs(m.credit_outstanding)],
  ];
  boxes.forEach(([label, value], i) => kpiBox(doc, 40 + (i % 4) * (boxW + 12), 178 + Math.floor(i / 4) * 68, boxW, label, value));

  // Position in each category
  const cats = [
    ['Highest profit', 'net_profit'],
    ['Top revenue', 'revenue'],
    ['Best margin', 'margin_pct'],
    ['Least waste', 'waste_pct'],
    ['Most orders', 'orders'],
  ];
  autoTable(doc, {
    startY: 330,
    head: [['Category', 'Position', 'Score']],
    body: [
      ...cats.map(([label, key]) => [label, card.ranks[key] ? `${ordinal(card.ranks[key])} of ${card.ranked_count}` : '-', '']),
      ['Overall (lower points is better)', card.overall_rank ? ordinal(card.overall_rank) : '-', card.score ?? '-'],
    ],
    styles: { fontSize: 9.5, cellPadding: 6 },
    headStyles: { fillColor: ORANGE, textColor: 255 },
    alternateRowStyles: { fillColor: [250, 246, 241] },
    margin: { left: 40, right: W / 2 + 10 },
    didParseCell(data) {
      if (data.section === 'body' && data.row.index === cats.length) data.cell.styles.fontStyle = 'bold';
    },
  });

  // Where the money came from, and what was lost
  const rightX = W / 2 + 28;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Sales by payment', rightX, 342);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  [['Cash', card.payment.cash], ['GPay', card.payment.gpay], ['On credit', card.payment.credit]].forEach(([label, value], i) => {
    doc.text(label, rightX, 364 + i * 18);
    doc.text(rs(value), W - 40, 364 + i * 18, { align: 'right' });
  });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Stock written off', rightX, 438);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  [['Expired', card.wastage.expired], ['Damaged', card.wastage.damaged]].forEach(([label, value], i) => {
    doc.text(label, rightX, 460 + i * 18);
    doc.text(rs(value), W - 40, 460 + i * 18, { align: 'right' });
  });

  // Best sellers
  const tableEnd = doc.lastAutoTable.finalY;
  autoTable(doc, {
    startY: Math.max(tableEnd, 500) + 22,
    head: [['Best sellers', 'Sold', 'Revenue', 'Profit']],
    body: card.top_items.length ? card.top_items.map((i) => [i.name, i.quantity, rs(i.revenue), rs(i.profit)]) : [['No sales yet', '', '', '']],
    styles: { fontSize: 9.5, cellPadding: 6 },
    headStyles: { fillColor: ORANGE, textColor: 255 },
    alternateRowStyles: { fillColor: [250, 246, 241] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 40, right: 40 },
    didParseCell(data) {
      // Headers sit over their numbers.
      if (data.section === 'head' && data.column.index > 0) data.cell.styles.halign = 'right';
    },
  });

  // Daily revenue as small bars
  const days = card.trend.slice(-16);
  if (days.length > 1) {
    const top = doc.lastAutoTable.finalY + 26;
    const H = doc.internal.pageSize.getHeight();
    if (top + 90 < H - 40) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Revenue by day', 40, top);
      const max = Math.max(...days.map((d) => d.revenue), 1);
      const barW = (W - 80) / days.length;
      days.forEach((d, i) => {
        const h = Math.max((d.revenue / max) * 56, d.revenue > 0 ? 2 : 0);
        doc.setFillColor(...ORANGE);
        doc.roundedRect(40 + i * barW + 3, top + 70 - h, barW - 6, h, 2, 2, 'F');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...MUTED);
        doc.text(d.date.slice(5), 40 + i * barW + barW / 2, top + 82, { align: 'center' });
      });
    }
  }

  footer(doc, card.event);
  doc.save(`scorecard-${fileSafe(card.stall.name)}-${stamp()}.pdf`);
}

/** The ranking of every stall, with the category winners, for the whole event or a period. */
export async function downloadEventSummary({ board, event, period }) {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();

  header(doc, 'Event summary', null, period, event);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Category winners', 40, 126);
  doc.setFont('helvetica', 'normal');
  const money = (a) => (a.unit === 'money' ? rs(a.winner.value) : a.unit === 'percent' ? `${a.winner.value}%` : String(a.winner.value));
  const boxW = (W - 80 - 24) / 3;
  board.awards.forEach((a, i) => {
    const x = 40 + (i % 3) * (boxW + 12);
    const y = 140 + Math.floor(i / 3) * 62;
    kpiBox(doc, x, y, boxW, a.title, a.winner ? `${a.winner.name}` : 'No winner yet');
    if (a.winner) {
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(money(a), x + boxW - 12, y + 18, { align: 'right' });
      doc.setTextColor(...INK);
    }
  });

  autoTable(doc, {
    startY: 290,
    head: [['#', 'Stall', 'Profit', 'Revenue', 'Margin', 'Waste', 'Orders', 'Points']],
    body: board.stalls.map((s) => [
      s.overall_rank || '-',
      s.name,
      rs(s.net_profit),
      rs(s.revenue),
      `${s.margin_pct}%`,
      `${s.waste_pct}%`,
      s.orders,
      s.score ?? '-',
    ]),
    styles: { fontSize: 9.5, cellPadding: 7 },
    headStyles: { fillColor: ORANGE, textColor: 255 },
    alternateRowStyles: { fillColor: [250, 246, 241] },
    columnStyles: { 0: { halign: 'center', cellWidth: 28 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
    margin: { left: 40, right: 40 },
    didParseCell(data) {
      if (data.section === 'head' && data.column.index >= 2) data.cell.styles.halign = 'right';
      if (data.section === 'head' && data.column.index === 0) data.cell.styles.halign = 'center';
      if (data.section === 'body' && data.row.index === 0 && board.stalls[0]?.overall_rank === 1) data.cell.styles.fontStyle = 'bold';
    },
  });

  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text('Points add up each stall\'s position in the five categories. Fewer points is better.', 40, doc.lastAutoTable.finalY + 18);

  footer(doc, event);
  doc.save(`event-summary-${stamp()}.pdf`);
}
