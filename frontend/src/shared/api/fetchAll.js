import { apiGet } from './client'

// Для пикеров (Тип, Сотрудник, Лицензия и т.п.) нужен полный список, а не
// одна курсорная страница — при масштабе ТЗ (до ~2000 объектов, но самих
// Типов/Сотрудников на порядки меньше) это дешевле, чем городить поиск
// внутри выпадающего списка.
export async function fetchAllPages(path) {
  let url = path
  const results = []
  while (url) {
    const data = await apiGet(url)
    results.push(...data.results)
    url = data.next
  }
  return results
}
