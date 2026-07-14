import XLSX from 'xlsx-js-style';

interface ExportColumn {
  header: string;
  width: number;
  isAmount?: boolean;
}

export function exportToStyledExcel(
  data: any[][],
  columns: ExportColumn[],
  sheetName: string,
  fileName: string
) {
  const headers = columns.map(c => c.header);
  const wb = XLSX.utils.book_new();
  const wsData = [headers, ...data];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = columns.map(c => ({ wch: c.width }));

  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1E40AF' } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    border: {
      top: { style: 'thin' as const, color: { rgb: '000000' } },
      bottom: { style: 'thin' as const, color: { rgb: '000000' } },
      left: { style: 'thin' as const, color: { rgb: '000000' } },
      right: { style: 'thin' as const, color: { rgb: '000000' } },
    }
  };

  const dataStyle = {
    border: {
      top: { style: 'thin' as const, color: { rgb: 'D1D5DB' } },
      bottom: { style: 'thin' as const, color: { rgb: 'D1D5DB' } },
      left: { style: 'thin' as const, color: { rgb: 'D1D5DB' } },
      right: { style: 'thin' as const, color: { rgb: 'D1D5DB' } },
    },
    alignment: { vertical: 'center' as const, wrapText: true },
  };

  const amountStyle = {
    ...dataStyle,
    numFmt: '#,##0.00',
    alignment: { horizontal: 'right' as const, vertical: 'center' as const },
  };

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellRef]) ws[cellRef] = { v: '', t: 's' };
      if (R === 0) {
        ws[cellRef].s = headerStyle;
      } else if (columns[C]?.isAmount) {
        ws[cellRef].s = amountStyle;
        ws[cellRef].t = 'n';
        ws[cellRef].z = '#,##0.00';
      } else {
        ws[cellRef].s = {
          ...dataStyle,
          fill: R % 2 === 0 ? { fgColor: { rgb: 'F8FAFC' } } : undefined,
        };
      }
    }
  }

  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

interface SheetData {
  name: string;
  data: any[][];
}

export function exportToMultiSheetExcel(
  sheets: SheetData[],
  columns: ExportColumn[],
  fileName: string
) {
  const wb = XLSX.utils.book_new();
  const headers = columns.map(c => c.header);

  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1E40AF' } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    border: {
      top: { style: 'thin' as const, color: { rgb: '000000' } },
      bottom: { style: 'thin' as const, color: { rgb: '000000' } },
      left: { style: 'thin' as const, color: { rgb: '000000' } },
      right: { style: 'thin' as const, color: { rgb: '000000' } },
    }
  };

  const dataStyle = {
    border: {
      top: { style: 'thin' as const, color: { rgb: 'D1D5DB' } },
      bottom: { style: 'thin' as const, color: { rgb: 'D1D5DB' } },
      left: { style: 'thin' as const, color: { rgb: 'D1D5DB' } },
      right: { style: 'thin' as const, color: { rgb: 'D1D5DB' } },
    },
    alignment: { vertical: 'center' as const, wrapText: true },
  };

  const amountStyle = {
    ...dataStyle,
    numFmt: '#,##0.00',
    alignment: { horizontal: 'right' as const, vertical: 'center' as const },
  };

  sheets.forEach(sheet => {
    const wsData = [headers, ...sheet.data];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = columns.map(c => ({ wch: c.width }));

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellRef]) ws[cellRef] = { v: '', t: 's' };
        if (R === 0) {
          ws[cellRef].s = headerStyle;
        } else if (columns[C]?.isAmount) {
          ws[cellRef].s = amountStyle;
          ws[cellRef].t = 'n';
          ws[cellRef].z = '#,##0.00';
        } else {
          ws[cellRef].s = {
            ...dataStyle,
            fill: R % 2 === 0 ? { fgColor: { rgb: 'F8FAFC' } } : undefined,
          };
        }
      }
    }

    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    // Sheet names max 31 chars in Excel
    const safeName = sheet.name.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  });

  XLSX.writeFile(wb, fileName);
}
