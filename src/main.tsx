import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './site/App'
import './site/tailwind.css'
import './site/styles.css'
import { BrowserRouter } from 'react-router-dom'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>)
