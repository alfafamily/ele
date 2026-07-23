import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Button, Card, Icon } from '../../shared/ui'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery.js'
import { GUIDE_SECTIONS } from './guideContent.jsx'
import './GuidePage.css'

// Раздел «Руководство» — статичная инструкция пользователя. Контент вынесен
// в guideContent.jsx (обновляется при выпуске новых фич). Desktop: оглавление
// слева (липкое) + все секции-карточки справа. Mobile: по одному разделу за раз
// с переключением свайпом/кнопками и селектом-оглавлением сверху.

// Навигация по внутренним ссылкам guide: переход к разделу по его id. На десктопе
// это скролл к секции, на мобильном — переключение активного раздела.
const GuideNavContext = createContext(null)

// Внутренняя ссылка на раздел: синтаксис [текст](#id) в контенте. Клик ведёт
// к нужному разделу через GuideNavContext (fallback — обычный якорь).
function GuideLink({ id, children }) {
  const navigate = useContext(GuideNavContext)
  return (
    <a
      href={'#' + id}
      className="ele-guide__link"
      onClick={(e) => {
        if (navigate) {
          e.preventDefault()
          navigate(id)
        }
      }}
    >
      {children}
    </a>
  )
}

// Инлайновое форматирование: **жирный**, {!красный акцент!} и ссылки [текст](#id)
// внутри строки.
function renderInline(text) {
  return text.split(/(\*\*[^*]+\*\*|\{![^}]+!\}|\[[^\]]+\]\(#[a-z-]+\))/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('{!') && part.endsWith('!}')) return <span key={i} className="ele-guide__danger">{part.slice(2, -2)}</span>
    const link = part.match(/^\[([^\]]+)\]\(#([a-z-]+)\)$/)
    if (link) return <GuideLink key={i} id={link[2]}>{link[1]}</GuideLink>
    return part
  })
}

function List({ items }) {
  return (
    <ul className="ele-guide__list">
      {items.map((item, i) => {
        const text = typeof item === 'string' ? item : item.text
        const sub = typeof item === 'string' ? null : item.sub
        return (
          <li key={i}>
            {renderInline(text)}
            {sub ? <List items={sub} /> : null}
          </li>
        )
      })}
    </ul>
  )
}

function Block({ block }) {
  switch (block.type) {
    case 'p':
      return <p className="ele-guide__p">{renderInline(block.text)}</p>
    case 'ul':
      return <List items={block.items} />
    case 'note':
      return (
        <div className="ele-guide__note">
          {block.text.split('\n\n').map((para, i) => (
            <p key={i} className="ele-guide__note-p">{renderInline(para)}</p>
          ))}
          {block.code ? <pre className="ele-guide__code">{block.code}</pre> : null}
        </div>
      )
    case 'table':
      return (
        <div className="ele-guide__table-scroll">
          <table className="ele-guide__table">
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th key={i}>{renderInline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'sub':
      return (
        <div className="ele-guide__sub">
          <div className="ele-guide__sub-title">{block.title}</div>
          {block.blocks.map((b, i) => (
            <Block key={i} block={b} />
          ))}
        </div>
      )
    default:
      return null
  }
}

// Карточка одного раздела: номер + заголовок + блоки контента.
function SectionCard({ section, num, id }) {
  return (
    <Card id={id} className="ele-guide__section">
      <h2 className="ele-guide__h2">
        <span className="ele-guide__section-num">{num}</span>
        {section.title}
      </h2>
      {section.blocks.map((b, bi) => (
        <Block key={bi} block={b} />
      ))}
    </Card>
  )
}

// Мобильный селект-оглавление: белая плашка с номером и названием активного
// раздела; по тапу раскрывается список всех разделов.
function GuideSelect({ sections, index, onPick }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const active = sections[index]
  return (
    <div className="ele-guide-m__select" ref={ref}>
      <button type="button" className="ele-guide-m__select-trigger" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="ele-guide__toc-num">{index + 1}</span>
        <span className="ele-guide-m__select-title">{active.title}</span>
        <Icon name="chevrons-up-down" size={18} strokeWidth={2} style={{ flex: 'none', color: 'var(--color-text-placeholder)' }} />
      </button>
      {open ? (
        <div className="ele-guide-m__select-list" role="listbox">
          {sections.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={i === index}
              className={'ele-guide-m__select-item' + (i === index ? ' ele-guide-m__select-item--active' : '')}
              onClick={() => {
                onPick(i)
                setOpen(false)
              }}
            >
              <span className="ele-guide__toc-num">{i + 1}</span>
              <span>{s.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// Порог свайпа: горизонтальное смещение должно заметно превышать вертикальное,
// чтобы обычная прокрутка страницы не переключала разделы.
const SWIPE_MIN = 50

function GuideMobile() {
  const [index, setIndex] = useState(0)
  const last = GUIDE_SECTIONS.length - 1

  // Переход к разделу i (с зажимом в границы) + прокрутка к началу.
  const go = (i) => {
    setIndex((prev) => {
      const next = Math.max(0, Math.min(last, i))
      if (next !== prev) window.scrollTo({ top: 0 })
      return next
    })
  }

  // Свайп ловим слушателями на window — тогда он работает на любой позиции
  // прокрутки длинного раздела, а не только у его верха. Функциональный
  // setIndex избавляет от устаревшего замыкания по index (не пере-подписываемся).
  useEffect(() => {
    let start = null
    const onStart = (e) => {
      const t = e.touches[0]
      start = { x: t.clientX, y: t.clientY }
    }
    const onEnd = (e) => {
      if (!start) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      start = null
      // Горизонтальный жест должен заметно преобладать над вертикальным.
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.4) return
      setIndex((prev) => {
        const next = Math.max(0, Math.min(last, dx < 0 ? prev + 1 : prev - 1))
        if (next !== prev) window.scrollTo({ top: 0 })
        return next
      })
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
    }
  }, [last])

  // Переход по внутренней ссылке [текст](#id): находим раздел по id и открываем его.
  const navigate = (id) => {
    const i = GUIDE_SECTIONS.findIndex((s) => s.id === id)
    if (i !== -1) go(i)
  }

  return (
    <div className="ele-guide">
      <h1 className="ele-guide__h1">Руководство пользователя</h1>
      <div className="ele-guide-m">
        <GuideSelect sections={GUIDE_SECTIONS} index={index} onPick={go} />

        <GuideNavContext.Provider value={navigate}>
          <div className="ele-guide-m__stage">
            <SectionCard section={GUIDE_SECTIONS[index]} num={index + 1} />
          </div>
        </GuideNavContext.Provider>

        <div className="ele-guide-m__nav">
          {index > 0 ? (
            <Button variant="secondary" fullWidth onClick={() => go(index - 1)}>
              ← Назад
            </Button>
          ) : null}
          {index < last ? (
            <Button fullWidth onClick={() => go(index + 1)}>
              Дальше →
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function GuidePage() {
  const isMobile = useMediaQuery('(max-width: 768px)')

  const scrollTo = (id) => {
    // Без behavior:'smooth' — в части окружений (в т.ч. при prefers-reduced-motion)
    // плавный скролл становится no-op; мгновенный переход надёжен везде.
    document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }

  if (isMobile) return <GuideMobile />

  return (
    <div className="ele-guide">
      <h1 className="ele-guide__h1">Руководство пользователя</h1>

      <div className="ele-sidebar-layout ele-guide__layout">
        <nav className="ele-guide__toc" aria-label="Содержание">
          {GUIDE_SECTIONS.map((s, i) => (
            <button key={s.id} type="button" className="ele-guide__toc-item" onClick={() => scrollTo(s.id)}>
              <span className="ele-guide__toc-num">{i + 1}</span>
              <span>{s.title}</span>
            </button>
          ))}
        </nav>

        <GuideNavContext.Provider value={scrollTo}>
          <div className="ele-guide__content">
            {GUIDE_SECTIONS.map((s, i) => (
              <SectionCard key={s.id} section={s} num={i + 1} id={s.id} />
            ))}
          </div>
        </GuideNavContext.Provider>
      </div>
    </div>
  )
}
