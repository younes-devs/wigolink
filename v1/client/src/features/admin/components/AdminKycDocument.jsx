export function AdminKycDocument({ label, photo, onZoom, selfie = false }) {
  return (
    <div className="kyc-review-thumb" onClick={() => onZoom(photo)} style={{ cursor: 'zoom-in' }}>
      <img src={photo} alt={label} style={selfie ? { objectPosition: 'center top' } : {}} />
      <span>{label}</span>
    </div>
  );
}
