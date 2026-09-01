export default function Metric({ label, value, delta }) {
    return (
        <div className="metric">
            <span>{label}</span>
            <strong>{value}</strong>
            {delta && <small>{delta}</small>}
        </div>
    );
}
