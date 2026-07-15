import { Card } from '../../shared/ui'
import { GUIDE_SECTIONS, GUIDE_INTRO } from './guideContent.jsx'
import './GuidePage.css'

// Раздел «Руководство» — статичная инструкция пользователя. Контент вынесен
// в guideContent.jsx (обновляется при выпуске новых фич); здесь только
// рендер: оглавление слева (липкое на desktop) + секции-карточки справа.

// Инлайновое форматирование: **жирный** внутри строки контента.
function renderInline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part
  )
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
      return <div className="ele-guide__note">{renderInline(block.text)}</div>
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

export function GuidePage() {
  const scrollTo = (id) => {
    // Без behavior:'smooth' — в части окружений (в т.ч. при prefers-reduced-motion)
    // плавный скролл становится no-op; мгновенный переход надёжен везде.
    document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }

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

        <div className="ele-guide__content">
          <Card className="ele-guide__intro">
            {GUIDE_INTRO.map((text, i) => (
              <p key={i} className="ele-guide__p">
                {renderInline(text)}
              </p>
            ))}
          </Card>

          {GUIDE_SECTIONS.map((s, i) => (
            <Card key={s.id} id={s.id} className="ele-guide__section">
              <h2 className="ele-guide__h2">
                <span className="ele-guide__section-num">{i + 1}</span>
                {s.title}
              </h2>
              {s.blocks.map((b, bi) => (
                <Block key={bi} block={b} />
              ))}
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
