import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { api } from '../services/api.js';
import { getAuth } from '../services/auth.js';

export default function CustomerProducts() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('');
    const [sort, setSort] = useState('featured');
    const [adding, setAdding] = useState(null);
    const addingRef = useRef(false);

    async function load() {
        setLoading(true);
        setError('');
        try {
            setProducts(await api.products());
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, []);

    const categories = useMemo(() => [...new Set(products.map(p => p.category))].sort(), [products]);
    const visible = useMemo(() => {
        const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const matches = products.filter(p => {
            const text = [p.name, p.description, p.category, ...(p.tags || [])].join(' ').toLowerCase();
            return (!category || p.category === category) && terms.every(term => text.includes(term));
        });
        if (sort === 'price-low') matches.sort((a, b) => a.price - b.price);
        if (sort === 'price-high') matches.sort((a, b) => b.price - a.price);
        return matches;
    }, [products, query, category, sort]);

    async function add(product) {
        if (addingRef.current) return;
        addingRef.current = true;
        setAdding(product.id);
        setError('');
        setSuccess('');
        try {
            const sessionId = getAuth()?.sessionId;
            if (!sessionId) throw new Error('Please sign in again to add products.');
            await api.add({ sessionId, productId: product.id, quantity: 1 });
            setSuccess(`${product.name} added to your cart.`);
        } catch (e) {
            setError(e.message);
        } finally {
            addingRef.current = false;
            setAdding(null);
        }
    }

    return (
        <Layout title="Products" subtitle="Browse RunX Sports and find your next training essential.">
            <div className="products-toolbar">
                <div>
                    <div className="tag">RunX Sports store</div>
                    <h2 className="products-title">Explore our products</h2>
                </div>
                <Link className="pill" to="/shop">Need help choosing? Ask AI</Link>
            </div>
            <div className="panel customer-catalog-filters">
                <label className="field">
                    <span>Search products</span>
                    <input type="search" placeholder="Search shoes, clothing, accessories…" value={query} onChange={e => setQuery(e.target.value)} />
                </label>
                <label className="field">
                    <span>Category</span>
                    <select value={category} onChange={e => setCategory(e.target.value)}>
                        <option value="">All categories</option>
                        {categories.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                </label>
                <label className="field">
                    <span>Sort by</span>
                    <select value={sort} onChange={e => setSort(e.target.value)}>
                        <option value="featured">Featured</option>
                        <option value="price-low">Price: low to high</option>
                        <option value="price-high">Price: high to low</option>
                    </select>
                </label>
            </div>
            {error && <div className="alert" role="alert">{error} <button type="button" onClick={load} disabled={loading}>Reload products</button></div>}
            {success && <div className="alert success" role="status">{success} <Link to="/cart">View cart</Link></div>}
            {loading ? <p role="status">Loading products…</p> : (
                <>
                    <p className="muted" role="status">{visible.length} product{visible.length === 1 ? '' : 's'} available</p>
                    {visible.length ? (
                        <div className="product-grid">
                            {visible.map(product => <ProductCard key={product.id} p={product} onAdd={add}
                                disabled={adding !== null} actionLabel={adding === product.id ? 'Adding…' : 'Add to cart'} />)}
                        </div>
                    ) : !error && <div className="panel">{products.length ? 'No products match your search. Try another category or search term.' : 'No products are currently available. Please check back soon.'}</div>}
                </>
            )}
        </Layout>
    );
}
