import { ArrowLeft, Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="not-found">
      <div className="not-found-icon"><Compass size={30} /></div>
      <h1>This page is not part of the workspace.</h1>
      <p>The address may have changed or the page may not exist yet.</p>
      <Link to="/" className="primary-button"><ArrowLeft size={16} /> Return to overview</Link>
    </div>
  );
}