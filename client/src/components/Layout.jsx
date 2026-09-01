import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    LogOut,
    Package,
    ScrollText,
    ShoppingBag,
    ShoppingCart,
    TrendingUp,
    User,
} from 'lucide-react';
import { getAuth, logout } from '../services/auth.js';
import ThemeToggle from './ThemeToggle.jsx';

export default function Layout({ children, title, subtitle, appClassName = '' }) {
    const navigate = useNavigate();
    const auth = getAuth();
    const isMerchant = auth?.role === 'merchant';

    function handleLogout() {
        logout();
        navigate('/login', { replace: true });
    }

    return (
        <div className={`app ${appClassName}`.trim()}>
            <aside className="sidebar">
                <div className="brand">
                    <div className="logo">R</div>
                    <div>
                        <b>RunX Sports</b>
                        <span>AI Commerce</span>
                    </div>
                </div>

                <nav>
                    {isMerchant ? (
                        <>
                            <NavLink to="/merchant" end>
                                <LayoutDashboard size={18} /> Overview
                            </NavLink>
                            <NavLink to="/merchant/products">
                                <Package size={18} /> Products
                            </NavLink>
                            <NavLink to="/merchant/growth">
                                <TrendingUp size={18} /> Growth Agent
                            </NavLink>
                            <NavLink to="/merchant/audit">
                                <ScrollText size={18} /> Audit Trail
                            </NavLink>
                        </>
                    ) : (
                        <>
                            <NavLink to="/shop">
                                <ShoppingBag size={18} /> AI Shop
                            </NavLink>
                            <NavLink to="/cart">
                                <ShoppingCart size={18} /> Cart
                            </NavLink>
                            <NavLink to="/products">
                                <Package size={18} /> Products
                            </NavLink>
                        </>
                    )}

                    <NavLink to="/profile">
                        <User size={18} /> Profile
                    </NavLink>
                </nav>

                <div className="sidebar-bottom">
                    <div className="account-card">
                        <div className="avatar-small">
                            {(auth?.name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className="account-meta">
                            <strong>{auth?.name || 'User'}</strong>
                            <span>{isMerchant ? 'Merchant' : 'Customer'}</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="logout-button"
                        onClick={handleLogout}
                    >
                        <LogOut size={17} /> Logout
                    </button>

                </div>
            </aside>

            <main>
                <header>
                    <div>
                        <h1>{title}</h1>
                        <p>{subtitle}</p>
                    </div>

                    <div className="header-actions">
                        <ThemeToggle />

                        {!isMerchant && (
                            <Link className="pill" to="/cart">
                                <ShoppingCart size={15} /> Cart
                            </Link>
                        )}

                        <Link className="profile-pill" to="/profile">
                            <User size={15} />
                            {auth?.name || 'Profile'}
                        </Link>
                    </div>
                </header>

                {children}
            </main>
        </div>
    );
}
