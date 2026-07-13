import './Card.css'

// Белая карточка-блок — базовая поверхность почти каждого экрана
// («Основная информация», карточки форм, экраны аутентификации).
export function Card({ children, className = '', ...rest }) {
  return (
    <div className={['ele-card', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  )
}
