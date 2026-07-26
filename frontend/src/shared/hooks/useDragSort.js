import { useState } from 'react'

// B30: чистая перестановка элемента массива с позиции from на позицию to.
export function reorder(arr, from, to) {
  const next = arr.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

// Перетаскивание строк списка за ручку (grip). HTML5 drag-and-drop: draggable
// «взводится» только при захвате именно за ручку (onPointerDown на ней), иначе
// draggable=true на всей строке ломал бы выделение текста в инпутах.
//
// onReorder(fromIndex, toIndex) — вызывается при успешном сбросе. Индексы —
// позиции в отображаемом (перетаскиваемом) подсписке.
//
// Возвращает:
//   dragIndex / overIndex — для подсветки перетаскиваемой строки и цели,
//   handleProps(index)    — навесить на ручку (grip),
//   rowProps(index)       — навесить на строку-контейнер.
export function useDragSort(onReorder) {
  const [armedIndex, setArmedIndex] = useState(null)
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)

  const reset = () => {
    setArmedIndex(null)
    setDragIndex(null)
    setOverIndex(null)
  }

  const handleProps = () => ({
    // Взводим драг на следующий рендер — к моменту dragstart строка уже
    // draggable. onPointerDown ловит и мышь, и перо.
    style: { cursor: 'grab', touchAction: 'none' },
  })

  const rowProps = (index) => ({
    draggable: armedIndex === index,
    onPointerDown: (e) => {
      // Взводим драг только если нажали на ручку (или её потомка).
      if (e.target.closest('[data-drag-handle]')) setArmedIndex(index)
    },
    onDragStart: (e) => {
      setDragIndex(index)
      e.dataTransfer.effectAllowed = 'move'
      try {
        e.dataTransfer.setData('text/plain', String(index))
      } catch {
        /* некоторые браузеры требуют setData — молча игнорируем отказ */
      }
    },
    onDragOver: (e) => {
      if (dragIndex === null || dragIndex === index) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (overIndex !== index) setOverIndex(index)
    },
    onDrop: (e) => {
      e.preventDefault()
      if (dragIndex !== null && dragIndex !== index) onReorder(dragIndex, index)
      reset()
    },
    onDragEnd: reset,
  })

  return { dragIndex, overIndex, handleProps, rowProps }
}
