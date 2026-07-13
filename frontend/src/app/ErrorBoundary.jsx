import { Component } from 'react'
import { ServerErrorPage } from './ServerErrorPage.jsx'

// Непойманная ошибка рендера → ERR·500 (§5.9) вместо белого экрана.
export class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error', error, info)
  }

  render() {
    if (this.state.hasError) return <ServerErrorPage />
    return this.props.children
  }
}
