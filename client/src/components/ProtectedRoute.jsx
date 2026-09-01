import { Navigate, useLocation } from 'react-router-dom';
import { getAuth } from '../services/auth.js';

export default function ProtectedRoute({ role, children }) {
    const location = useLocation();
    const auth = getAuth();

    if (!auth) {
        return (
            <Navigate
                to="/login"
                replace
                state={{ from: location }}
            />
        );
    }

    if (role && auth.role !== role) {
        return (
            <Navigate
                to={auth.role === 'merchant' ? '/merchant' : '/shop'}
                replace
            />
        );
    }

    return children;
}
