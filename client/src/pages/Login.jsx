import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { login, getAuth } from '../services/auth.js';

const roleCopy = {
    customer: {
        title: 'Shop smarter with AI',
        subtitle: 'Tell RunX Sports what you need and let the AI find the right products.',
        button: 'Continue as Customer',
    },
    merchant: {
        title: 'Run your store with AI',
        subtitle: 'Track revenue, activate growth strategies and audit every AI action.',
        button: 'Continue as Merchant',
    },
};

export default function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const existingAuth = getAuth();

    const [role, setRole] = useState('customer');
    const [email, setEmail] = useState('customer@runx.test');
    const [password, setPassword] = useState('customer123');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    if (existingAuth) {
        return (
            <Navigate
                to={existingAuth.role === 'merchant' ? '/merchant' : '/shop'}
                replace
            />
        );
    }

    const copy = roleCopy[role];

    function changeRole(nextRole) {
        setRole(nextRole);
        setError('');

        if (nextRole === 'merchant') {
            setEmail('merchant@runx.test');
            setPassword('merchant123');
        } else {
            setEmail('customer@runx.test');
            setPassword('customer123');
        }
    }

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError('');

        try {
            const auth = await login(email.trim(), password, role);
            const destination =
                location.state?.from?.pathname ||
                (auth.role === 'merchant' ? '/merchant' : '/shop');

            navigate(destination, { replace: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-shell">
                <section className="auth-visual">
                    <div className="auth-brand">
                        <div className="logo">R</div>
                        <div>
                            <strong>RunX Sports</strong>
                            <span>AI Commerce</span>
                        </div>
                    </div>

                    <div className="auth-visual-content">
                        <div className="auth-chip">AI-POWERED COMMERCE</div>
                        <h1>{copy.title}</h1>
                        <p>{copy.subtitle}</p>

                        <div className="auth-flow">
                            <div>
                                <span>01</span>
                                <strong>Tell us what you want</strong>
                            </div>
                            <div>
                                <span>02</span>
                                <strong>AI discovers the best match</strong>
                            </div>
                            <div>
                                <span>03</span>
                                <strong>Checkout stays guarded</strong>
                            </div>
                        </div>
                    </div>

                    <div className="auth-demo-note">
                        Demo application · Razorpay test mode · Simulated merchant data
                    </div>
                </section>

                <section className="auth-card">
                    <div className="auth-card-header">
                        <p className="auth-eyebrow">Welcome back</p>
                        <h2>Sign in to RunX</h2>
                        <p>Select how you want to use the platform.</p>
                    </div>

                    <div className="role-switch" role="tablist" aria-label="Account type">
                        <button
                            type="button"
                            className={role === 'customer' ? 'role-button active' : 'role-button'}
                            onClick={() => changeRole('customer')}
                        >
                            Customer
                        </button>
                        <button
                            type="button"
                            className={role === 'merchant' ? 'role-button active' : 'role-button'}
                            onClick={() => changeRole('merchant')}
                        >
                            Merchant
                        </button>
                    </div>

                    <form onSubmit={submit} className="auth-form">
                        <div className="field">
                            <label htmlFor="email">Email address</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="you@example.com"
                                autoComplete="email"
                                required
                            />
                        </div>

                        <div className="field">
                            <label htmlFor="password">Password</label>
                            <div className="password-wrap">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder="Enter your password"
                                    autoComplete="current-password"
                                    required
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword((value) => !value)}
                                >
                                    {showPassword ? 'Hide' : 'Show'}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="alert danger auth-error">
                                {error}
                            </div>
                        )}

                        <button className="primary auth-submit" type="submit" disabled={busy}>
                            {busy ? 'Signing in…' : copy.button}
                        </button>
                    </form>

                    <div className="demo-credentials">
                        <div>
                            <span>Demo email</span>
                            <strong>{role === 'merchant' ? 'merchant@runx.test' : 'customer@runx.test'}</strong>
                        </div>
                        <div>
                            <span>Password</span>
                            <strong>{role === 'merchant' ? 'merchant123' : 'customer123'}</strong>
                        </div>
                    </div>

                    <p className="auth-footnote">
                        Credentials and roles are verified by the server. Published demo credentials work only when explicitly enabled by the server administrator.
                    </p>
                </section>
            </div>
        </div>
    );
}
