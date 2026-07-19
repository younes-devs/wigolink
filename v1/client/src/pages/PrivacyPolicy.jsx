import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icons.jsx';
import { t, useLang } from '../i18n.js';
import { formatLegalText, getLegalCopy } from '../legalCopy.js';
import { useIndexable } from '../useIndexable.js';

function LegalSection({ copy, section }) {
  const format = (text) => formatLegalText(text, copy);

  return <div id={section.id} className="card policy-section">
    <h2 className="policy-h2">{section.title}</h2>
    <div className="policy-body">
      {section.paragraphs?.map((paragraph, index) => <p key={index}>{format(paragraph)}</p>)}
      {section.list && <ul className="checklist">
        {section.list.map((item, index) => <li key={index}>{format(item)}</li>)}
      </ul>}
      {section.ordered && <ol className="policy-ol">
        {section.ordered.map((item, index) => <li key={index}>{format(item)}</li>)}
      </ol>}
      {section.table && <table className="policy-table">
        <thead><tr>{section.table.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{section.table.rows.map((row, rowIndex) => <tr key={rowIndex}>
          {row.map((cell, cellIndex) => <td key={cellIndex}>{format(cell)}</td>)}
        </tr>)}</tbody>
      </table>}
    </div>
  </div>;
}

export default function PrivacyPolicy() {
  const nav = useNavigate();
  useLang();
  useIndexable();
  const copy = getLegalCopy('privacy');

  return <div>
    <button className="link-btn mb" onClick={() => nav(-1)}>
      <Icon name="arrowLeft" size={14} />{t('common.back')}
    </button>
    <h1 className="page-title">{copy.title}</h1>
    <p className="page-sub">{copy.updated.replace('{date}', copy.lastUpdate)}</p>
    <div className="alert alert-warn"><Icon name="alert" size={17} /><span>{copy.warning}</span></div>
    {copy.sections.map((section) => <LegalSection copy={copy} section={section} key={section.id} />)}
    <div className="card center" style={{ padding: '20px 18px' }}>
      <Icon name="mail" size={22} />
      <p className="muted mt" style={{ fontSize: 13 }}>{copy.question}</p>
      <b style={{ color: 'var(--accent)' }}>{copy.contact}</b>
    </div>
  </div>;
}
