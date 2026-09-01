import { Plus } from 'lucide-react';
import { money } from '../services/api.js';
import { correctedProductImage } from '../../../shared/catalogImages.mjs';

export default function ProductCard({ p, onAdd, actionLabel = 'Add', disabled = false, onEdit, onDelete }) {
    return (
        <div className="product-card">
            <img src={correctedProductImage(p)} alt={p.name} />

            <div className="pc-body">
                <div className="tag">{p.category}</div>
                <h3>{p.name}</h3>
                <p>{p.description}</p>
                {p.specifications?.demoListing && <small className="muted">Demo price & stock · Generic illustration</small>}

                <div className="pc-bottom">
                    <strong>{money(p.price)}</strong>
                    {onAdd && (
                        <button type="button" disabled={disabled} aria-label={`${actionLabel}: ${p.name}`} onClick={() => onAdd(p)}>
                            <Plus size={16} /> {actionLabel}
                        </button>
                    )}
                </div>
                {(onEdit || onDelete) && (
                    <div className="pc-merchant-actions">
                        <span className="muted">Stock: <strong>{p.stock}</strong></span>
                        <div>
                            {onEdit && <button type="button" className="secondary" disabled={disabled} onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`}>Edit</button>}
                            {onDelete && <button type="button" className="secondary" disabled={disabled} onClick={() => onDelete(p)} aria-label={`Delete ${p.name}`}>Delete</button>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
