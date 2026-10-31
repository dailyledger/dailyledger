/*
 * Report export: Excel (.xlsx) and PDF, generated in the browser.
 * Both libraries are imported on demand so they are not part of the page load.
 *
 * `report` is { title, meta: [lines], headers: [labels], rows: [[values]],
 * moneyCols: Set of column indexes, totals: [values] | null }.
 */

const stamp = () => new Date().toISOString().slice(0, 10);
const fileBase = (title) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp()}`;
const money = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function exportExcel(report) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');

  const cell = (value, i) =>
    report.moneyCols.has(i) && value !== '' && value !== null
      ? { value: Number(value) || 0, type: Number, format: '#,##0.00', align: 'right' }
      : { value: value === null || value === undefined ? '' : String(value) };

  const bold = (value) => ({ value, fontWeight: 'bold' });
  const data = [
    [bold(report.title)],
    ...report.meta.map((line) => [line]),
    [],
    report.headers.map((h) => ({ value: h, fontWeight: 'bold', backgroundColor: '#d9f3f0' })),
    ...report.rows.map((row) => row.map(cell)),
  ];
  if (report.totals) {
    data.push(report.totals.map((v, i) => ({ ...cell(v, i), fontWeight: 'bold' })));
  }

  await writeExcelFile(data, {
    columns: report.headers.map((h, i) => ({ width: report.moneyCols.has(i) ? 16 : Math.max(14, h.length + 4) })),
  }).toFile(`${fileBase(report.title)}.xlsx`);
}

export async function exportPdf(report) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.text(report.title, 40, 42);
  doc.setFontSize(9);
  doc.setTextColor(110);
  report.meta.forEach((line, i) => doc.text(line, 40, 60 + i * 13));

  // The built-in PDF font has no rupee glyph, so amounts are plain numbers here.
  const show = (value, i) => (report.moneyCols.has(i) && value !== '' ? money(value) : value ?? '');
  const body = report.rows.map((row) => row.map(show));
  if (report.totals) body.push(report.totals.map(show));

  autoTable(doc, {
    startY: 66 + report.meta.length * 13,
    head: [report.headers],
    body,
    styles: { fontSize: 8.5, cellPadding: 5 },
    headStyles: { fillColor: [20, 184, 166], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 248, 248] },
    columnStyles: Object.fromEntries([...report.moneyCols].map((i) => [i, { halign: 'right' }])),
    didParseCell(data) {
      if (report.totals && data.section === 'body' && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  doc.save(`${fileBase(report.title)}.pdf`);
}
