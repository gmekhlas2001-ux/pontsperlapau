export type ExcelCellValue = string | number | boolean | Date | null;
export type ExcelRow = Record<string, ExcelCellValue>;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function saveRowsAsExcel(
  rows: ExcelRow[],
  sheetName: string,
  filename: string,
  columnWidths?: number[],
) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ponts per la Pau';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName);
  const headers = Object.keys(rows[0] ?? {});

  worksheet.columns = headers.map((header, index) => ({
    header,
    key: header,
    width: columnWidths?.[index] ?? Math.max(14, Math.min(40, header.length + 4)),
  }));

  rows.forEach((row) => worksheet.addRow(row));

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { horizontal: 'center' };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0D9488' },
  };

  worksheet.columns.forEach((column, index) => {
    let max = headers[index]?.length ?? 10;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      max = Math.max(max, String(cell.value ?? '').length);
    });
    column.width = columnWidths?.[index] ?? Math.max(12, Math.min(60, max + 2));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer as BlobPart], { type: XLSX_MIME }), filename);
}
