import { LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { getAuth, logout } from '../services/auth.js';

export default function Profile() {
    const navigate = useNavigate();
    const auth = getAuth();

    function handleLogout() {
        logout();
        navigate('/login', { replace: true });
    }

    return (
        <Layout
            title="My Profile"
            subtitle="Manage your account preferences and session settings."
        >
            <div className="profile-layout">
                <section className="panel profile-hero">
                    <div className="profile-avatar">
                        {(auth?.name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div className="tag">{auth?.role === 'merchant' ? 'Merchant account' : 'Customer account'}</div>
                        <h2>{auth?.name || 'User'}</h2>
                        <p className="muted">
                            {auth?.role === 'merchant'
                                ? 'RunX Sports merchant workspace'
                                : 'RunX Sports AI shopping account'}
                        </p>
                    </div>
                </section>

                <section className="panel">
                    <h2>Account details</h2>
                    <div className="profile-details">
                        <div className="profile-detail">
                            <div className="profile-detail-icon"><UserRound size={18} /></div>
                            <div>
                                <span>Name</span>
                                <strong>{auth?.name || '—'}</strong>
                            </div>
                        </div>
                        <div className="profile-detail">
                            <div className="profile-detail-icon"><Mail size={18} /></div>
                            <div>
                                <span>Email</span>
                                <strong>{auth?.email || '—'}</strong>
                            </div>
                        </div>
                        <div className="profile-detail">
                            <div className="profile-detail-icon"><ShieldCheck size={18} /></div>
                            <div>
                                <span>Account type</span>
                                <strong>{auth?.role === 'merchant' ? 'Merchant' : 'Customer'}</strong>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="panel profile-settings">
                    <div>
                        <h2>Appearance</h2>
                        <p className="muted">Choose the theme that feels best for your workspace.</p>
                    </div>
                    <div className="theme-setting">
                        <ThemeToggle />
                        <span>Toggle dark / light mode</span>
                    </div>
                </section>

                <section className="panel profile-danger">
                    <div>
                        <h2>Sign out</h2>
                        <p className="muted">End your current session on this device.</p>
                    </div>
                    <button type="button" className="danger-button" onClick={handleLogout}>
                        <LogOut size={17} /> Logout
                    </button>
                </section>
            </div>
        </Layout>
    );
}
