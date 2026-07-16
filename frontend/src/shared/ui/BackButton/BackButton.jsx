import { useNavigate } from 'react-router-dom'
import { Icon } from '../Icon/Icon.jsx'
import './BackButton.css'

// Кнопка-иконка «Назад» в шапках вложенных экранов (карточки объектов,
// редактор Типов) — только стрелка, размером и насыщенностью под стать
// заголовку. По умолчанию — возврат на предыдущий экран истории; onClick можно
// переопределить. На начальных экранах разделов (списки, Профиль, Настройки,
// Руководство) и на формах (там есть «Отмена») не нужна.
export function BackButton({ onClick, className = '', ...rest }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      aria-label="Назад"
      title="Назад"
      onClick={onClick || (() => navigate(-1))}
      className={['ele-back-btn', className].filter(Boolean).join(' ')}
      {...rest}
    >
      <Icon name="chevron-left" size={32} strokeWidth={2.2} />
    </button>
  )
}
