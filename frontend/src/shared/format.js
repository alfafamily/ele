// Человекочитаемый размер в байтах: Б/КБ/МБ/ГБ/ТБ, десятичная запятая (ru).
// Одна значащая дробная цифра начиная с МБ; Б/КБ — целые.
export function formatBytes(bytes) {
  if (bytes == null) return '—'
  const KB = 1024
  const MB = KB * 1024
  const GB = MB * 1024
  const TB = GB * 1024
  // Одна дробная цифра, но целые значения без хвоста «,0» (500 МБ, не 500,0 МБ).
  const ru = (n) => n.toFixed(1).replace(/\.0$/, '').replace('.', ',')
  if (bytes < KB) return `${bytes} Б`
  if (bytes < MB) return `${Math.round(bytes / KB)} КБ`
  if (bytes < GB) return `${ru(bytes / MB)} МБ`
  if (bytes < TB) return `${ru(bytes / GB)} ГБ`
  return `${ru(bytes / TB)} ТБ`
}
