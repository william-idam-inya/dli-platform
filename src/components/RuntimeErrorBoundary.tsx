import { Component, type ReactNode } from 'react';
import './RuntimeErrorBoundary.css';

type Props = { children: ReactNode };
type State = { failed: boolean };

/**
 * Last-resort render guard for the whole client application.
 * It intentionally does not log or transmit exception text, stack traces,
 * account information, or page content. Async/network errors must still be
 * handled by their individual pages and Supabase operations.
 */
export default class RuntimeErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="dli-runtime-error" role="alert">
        <section className="dli-runtime-error-card">
          <span aria-hidden="true" className="dli-runtime-error-icon">!</span>
          <p className="dli-runtime-error-eyebrow">DLI PLATFORM · RECOVERY</p>
          <h1>This page could not be displayed</h1>
          <p>
            An unexpected display error interrupted this view.
            Nothing has been submitted or changed by this recovery screen.
            Reload the platform to start a fresh view.
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload DLI Platform
          </button>
          <p className="dli-runtime-error-hint">
            If the problem continues, report which page you were visiting
            to DLI administration. Do not share your password or private
            learner information in an error report.
          </p>
        </section>
      </main>
    );
  }
}
