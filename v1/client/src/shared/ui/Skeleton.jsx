// Écrans de chargement squelette — remplacent le texte "Chargement…" par une forme
// qui préfigure le contenu réel, pour une transition plus douce et plus professionnelle.

export function SkeletonCard({ lines = 2, avatar = true }) {
  return (
    <div className="card skeleton-card">
      <div className="list-row">
        {avatar && <div className="skel skel-avatar" />}
        <div className="grow">
          <div className="skel skel-line" style={{ width: '70%' }} />
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i} className="skel skel-line" style={{ width: `${85 - i * 15}%`, marginTop: 8 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3, lines = 2, avatar = true }) {
  return (
    <div className="card-grid">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} avatar={avatar} />
      ))}
    </div>
  );
}

export function SkeletonStatGrid() {
  return (
    <div className="stat-grid mb">
      {Array.from({ length: 4 }).map((_, i) => (
        <div className="stat" key={i}>
          <div className="skel skel-line" style={{ width: '40%', height: 22, marginBottom: 6 }} />
          <div className="skel skel-line" style={{ width: '75%', height: 11 }} />
        </div>
      ))}
    </div>
  );
}
