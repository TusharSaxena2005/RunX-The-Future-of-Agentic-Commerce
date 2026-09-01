import React from 'react';
import { createRoot } from 'react-dom/client';
import {
    BrowserRouter,
    Navigate,
    Route,
    Routes,
} from 'react-router-dom';
import './styles.css';
import Audit from './pages/Audit.jsx';
import Cart from './pages/Cart.jsx';
import Profile from './pages/Profile.jsx';
import Growth from './pages/Growth.jsx';
import Login from './pages/Login.jsx';
import Merchant from './pages/Merchant.jsx';
import Products from './pages/Products.jsx';
import CustomerProducts from './pages/CustomerProducts.jsx';
import Shop from './pages/Shop.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { initTheme } from './services/theme.js';

initTheme();

function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />

            <Route
                path="/"
                element={<Navigate to="/login" replace />}
            />

            <Route
                path="/shop"
                element={
                    <ProtectedRoute role="customer">
                        <Shop />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/cart"
                element={
                    <ProtectedRoute role="customer">
                        <Cart />
                    </ProtectedRoute>
                }
            />

            <Route path="/products" element={
                <ProtectedRoute role="customer"><CustomerProducts /></ProtectedRoute>
            } />

            <Route
                path="/profile"
                element={
                    <ProtectedRoute>
                        <Profile />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/merchant"
                element={
                    <ProtectedRoute role="merchant">
                        <Merchant />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/merchant/products"
                element={
                    <ProtectedRoute role="merchant">
                        <Products />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/merchant/growth"
                element={
                    <ProtectedRoute role="merchant">
                        <Growth />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/merchant/audit"
                element={
                    <ProtectedRoute role="merchant">
                        <Audit />
                    </ProtectedRoute>
                }
            />

            <Route
                path="*"
                element={<Navigate to="/login" replace />}
            />
        </Routes>
    );
}

createRoot(document.getElementById('root')).render(
    <BrowserRouter>
        <App />
    </BrowserRouter>
);
