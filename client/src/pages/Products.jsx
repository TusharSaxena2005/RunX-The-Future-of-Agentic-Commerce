import { useEffect, useState } from 'react';
import { Check, PackagePlus, Plus, X } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { api } from '../services/api.js';

const emptyForm = {
    name: '',
    description: '',
    category: 'Running Shoes',
    price: '',
    stock: '',
    image: '',
    tags: '',
    specifications: '{\n  "material": ""\n}',
    popularity: '0',
    conversionRate: '0',
    relatedProductIds: [],
};

export default function Products() {
    const [products, setProducts] = useState([]);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [deleting, setDeleting] = useState(null);

    function edit(product) {
        setEditingId(product.id);
        setForm({ ...product, tags: product.tags.join(', '),
            specifications: JSON.stringify(product.specifications, null, 2),
            relatedProductIds: (product.relatedProductIds || []).filter(id => products.some(p => p.id === id)),
        });
        setError('');
        setSuccess('');
        setOpen(true);
    }

    async function removeProduct() {
        setSaving(true);
        setError('');
        try {
            await api.deleteProduct(deleting.id);
            setProducts(current => current.filter(p => p.id !== deleting.id));
            setDeleting(null);
            setSuccess('Product removed from the store. Existing order records are preserved.');
        } catch (e) { setError(e.message); }
        finally { setSaving(false); }
    }

    async function load() {
        try {
            setProducts(await api.products());
        } catch (e) {
            setError(e.message);
        }
    }

    useEffect(() => {
        load();
    }, []);

    function update(field, value) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    function toggleRelated(id) {
        setForm((current) => ({
            ...current,
            relatedProductIds: current.relatedProductIds.includes(id)
                ? current.relatedProductIds.filter((item) => item !== id)
                : [...current.relatedProductIds, id],
        }));
    }

    async function submit(event) {
        event.preventDefault();
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            let specifications;

            try {
                specifications = JSON.parse(form.specifications || '{}');
            } catch {
                throw new Error('Specifications must be valid JSON.');
            }

            const payload = {
                name: form.name.trim(),
                description: form.description.trim(),
                category: form.category.trim(),
                price: Number(form.price),
                stock: Number(form.stock),
                image: form.image.trim(),
                tags: form.tags
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                specifications,
                popularity: Number(form.popularity),
                conversionRate: Number(form.conversionRate),
                relatedProductIds: form.relatedProductIds,
            };
            if (editingId) await api.updateProduct(editingId, payload);
            else await api.createProduct(payload);

            await load();
            setForm(emptyForm);
            setOpen(false);
            setSuccess(editingId ? 'Product details updated.' : 'Product added successfully. It is now available to the AI catalog.');
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Layout
            title="Product Catalog"
            subtitle="RunX Sports · manage the live catalog used by the AI shopping agent"
        >
            <div className="products-toolbar">
                <div>
                    <div className="tag">Merchant catalog</div>
                    <h2 className="products-title">Products in your store</h2>
                    <p className="muted">Adding a product here immediately makes it available to catalog search.</p>
                </div>

                <button className="primary add-product-button" onClick={() => { setEditingId(null); setForm(emptyForm); setOpen(true); setError(''); setSuccess(''); }}>
                    <Plus size={17} /> Add Product
                </button>
            </div>

            {success && (
                <div className="alert success products-alert">
                    <Check size={16} /> {success}
                </div>
            )}

            {error && (
                <div className="alert danger products-alert">
                    {error}
                </div>
            )}

            <div className="panel">
                <div className="product-grid">
                    {products.map((product) => (
                        <ProductCard key={product.id} p={product} onEdit={edit}
                            onDelete={(selected) => { setDeleting(selected); setError(''); setSuccess(''); }} />
                    ))}
                </div>
            </div>

            {open && (
                <div className="modal-backdrop" onMouseDown={(event) => { if (!saving && event.target === event.currentTarget) setOpen(false); }}>
                    <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
                        <div className="modal-header">
                            <div>
                                <div className="tag">{editingId ? 'Edit catalog item' : 'New catalog item'}</div>
                                <h2 id="product-form-title">{editingId ? 'Edit Product' : 'Add Product'}</h2>
                                <p className="muted">Manage product details used by the store and AI agent.</p>
                            </div>
                            <button className="icon-button" type="button" disabled={saving} onClick={() => setOpen(false)} aria-label="Close">
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={submit} className="product-form">
                            {error && <div className="alert danger" role="alert">{error}</div>}
                            <div className="form-grid">
                                <div className="field full-span">
                                    <label>Product name</label>
                                    <input required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Trail Runner Pro" />
                                </div>

                                <div className="field">
                                    <label>Category</label>
                                    <input required value={form.category} onChange={(e) => update('category', e.target.value)} placeholder="Running Shoes" />
                                </div>

                                <div className="field">
                                    <label>Price (₹)</label>
                                    <input required min="1" type="number" value={form.price} onChange={(e) => update('price', e.target.value)} placeholder="3999" />
                                </div>

                                <div className="field">
                                    <label>Stock</label>
                                    <input required min="0" type="number" value={form.stock} onChange={(e) => update('stock', e.target.value)} placeholder="50" />
                                </div>

                                <div className="field">
                                    <label>Image URL</label>
                                    <input required value={form.image} onChange={(e) => update('image', e.target.value)} placeholder="https://... or /images/products/..." />
                                </div>

                                <div className="field full-span">
                                    <label>Description</label>
                                    <textarea required value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="Describe who the product is for and its main benefits." />
                                </div>

                                <div className="field">
                                    <label>Tags</label>
                                    <input value={form.tags} onChange={(e) => update('tags', e.target.value)} placeholder="running, daily, lightweight" />
                                    <small>Separate tags with commas.</small>
                                </div>

                                <div className="field">
                                    <label>Popularity (0–1)</label>
                                    <input min="0" max="1" step="0.01" type="number" value={form.popularity} onChange={(e) => update('popularity', e.target.value)} />
                                </div>

                                <div className="field">
                                    <label>Conversion rate (0–1)</label>
                                    <input min="0" max="1" step="0.01" type="number" value={form.conversionRate} onChange={(e) => update('conversionRate', e.target.value)} />
                                </div>

                                <div className="field full-span">
                                    <label>Specifications (JSON)</label>
                                    <textarea className="code-field" rows="5" value={form.specifications} onChange={(e) => update('specifications', e.target.value)} />
                                </div>
                            </div>

                            <div className="related-picker">
                                <div className="field">
                                    <label>Frequently bought with</label>
                                    <span className="field-hint">Select existing products to build AI cross-sell relationships.</span>
                                </div>

                                <div className="related-options">
                                    {products.filter(product => product.id !== editingId).map((product) => (
                                        <label className={`related-option ${form.relatedProductIds.includes(product.id) ? 'selected' : ''}`} key={product.id}>
                                            <input type="checkbox" checked={form.relatedProductIds.includes(product.id)} onChange={() => toggleRelated(product.id)} />
                                            <span>{product.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="secondary" disabled={saving} onClick={() => setOpen(false)}>Cancel</button>
                                <button type="submit" className="primary" disabled={saving}>
                                    <PackagePlus size={17} />
                                    {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Product'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {deleting && <div className="modal-backdrop">
                <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="delete-product-title">
                    <h2 id="delete-product-title">Delete {deleting.name}?</h2>
                    <p>This removes the product from the store and AI recommendations. Existing order records are kept.</p>
                    {error && <div className="alert danger" role="alert">{error}</div>}
                    <div className="modal-actions">
                        <button className="secondary" disabled={saving} onClick={() => setDeleting(null)}>Cancel</button>
                        <button className="primary" disabled={saving} onClick={removeProduct}>{saving ? 'Deleting…' : 'Delete Product'}</button>
                    </div>
                </div>
            </div>}
        </Layout>
    );
}
