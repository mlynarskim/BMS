import React from 'react';
import { createRoot } from 'react-dom/client';
import BMSReaderApp from './App';
import './index.css';
// React 19 compatible
const container = document.getElementById('root');
if (!container)
    throw new Error('Root element not found');
const root = createRoot(container);
root.render(React.createElement(BMSReaderApp, null));
