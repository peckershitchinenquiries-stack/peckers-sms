/**
 * Minimal RFC 4180 CSV writer. No dependency — the whole feature is escaping
 * quotes and picking a line ending.
 */

export interface CsvColumn<Row> {
  header: string
  value: (row: Row) => string | number | null | undefined
}

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  // Quote when the cell contains a delimiter, quote or newline.
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function toCsv<Row>(rows: Row[], columns: Array<CsvColumn<Row>>): string {
  const lines = [columns.map((column) => escapeCell(column.header)).join(',')]

  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(column.value(row))).join(','))
  }

  // CRLF keeps Excel on Windows happy; the BOM stops it mangling accents.
  return `﻿${lines.join('\r\n')}\r\n`
}

/** Builds the headers that make a browser download rather than render a CSV. */
export function csvResponseHeaders(filename: string): HeadersInit {
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
    'Cache-Control': 'no-store',
  }
}
