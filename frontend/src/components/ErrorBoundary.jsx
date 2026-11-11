import { Component } from 'react';
import { Link } from 'react-router-dom';

import Button from './ui/Button';
import { isChunkLoadError } from '../utils/chunkRecovery';

/**
 * Catches render errors below it so one broken page cannot blank the site
 * (ZT-05). `resetKey` clears the error when it changes — the route boundary
 * passes the pathname, so navigating anywhere else recovers.
 */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Zurii: a page failed to render.', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return this.props.fallback({ error, reset: this.reset });
  }
}

const reload = () => window.location.reload();

/**
 * What a visitor sees when a page fails. Same height as the loading
 * placeholder, so the footer does not jump either way, and Topbar/Footer stay
 * usable around it.
 */
export function RouteErrorFallback({ error, reset }) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const chunk = isChunkLoadError(error);

  let title = 'Something went wrong on this page.';
  let description = 'Please try again. The rest of the site is still available.';
  let action = (
    <Button variant="secondary" size="md" onClick={reset}>
      Try Again
    </Button>
  );
  if (offline) {
    title = 'You appear to be offline.';
    description = 'Check your connection, then try again.';
    action = (
      <Button variant="secondary" size="md" onClick={reload}>
        Try Again
      </Button>
    );
  } else if (chunk) {
    title = 'This page could not be loaded.';
    description = 'Zurii may have just been updated, or the connection dropped. Reloading usually fixes it.';
    action = (
      <Button variant="secondary" size="md" onClick={reload}>
        Reload Page
      </Button>
    );
  }

  return (
    <div className="min-h-screen pt-16 sm:pt-[68px] flex items-center justify-center px-4">
      <div
        role="alert"
        className="w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 px-6 py-10 text-center"
      >
        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</p>
        <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">{description}</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {action}
          <Link
            to="/"
            className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
          >
            Go to the home page
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Last resort around the whole app (Topbar, Footer and anything outside the
 * route boundary). Plain markup and a reload: nothing here depends on the
 * router or on components that might be the ones failing.
 */
export function AppErrorFallback() {
  return (
    <div role="alert" className="min-h-screen flex items-center justify-center px-4 bg-white dark:bg-zinc-950">
      <div className="max-w-md text-center">
        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Something went wrong.</p>
        <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">Please reload the page to continue.</p>
        <button
          type="button"
          onClick={reload}
          className="mt-5 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-100"
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}
