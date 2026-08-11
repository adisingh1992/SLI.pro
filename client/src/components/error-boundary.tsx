import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Stops one thrown error from blanking the whole application.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * A single `throw` in the Foundation Session chat — from inside a `setState`
 * updater, so it surfaced during React's render phase rather than at the call
 * site — unmounted the entire tree. React's default behaviour for an
 * unhandled render error is to remove everything, on the reasoning that a
 * half-rendered UI is more dangerous than none.
 *
 * That reasoning is sound in general and wrong for us in particular. The
 * student was twenty minutes into a session. What they saw was a white page.
 * Their transcript was safe on the server, but nothing on screen said so, and
 * the obvious recovery — reload — is the one thing a person mid-conversation
 * is least likely to risk.
 *
 * The specific bug is fixed. This is here because the next one will be
 * different, and the blast radius is the part worth capping. A boundary is not
 * error handling; it is the floor under it.
 *
 * ── DELIBERATELY NOT A RETRY ────────────────────────────────────────────────
 * Re-rendering the same subtree that just threw usually throws again, which
 * produces a flicker loop that is harder to escape than a static message. The
 * button reloads the route instead, and the copy tells the student the part
 * they actually care about: the conversation is saved.
 */

type Props = {
  children: ReactNode;
  /** Shown above the message — e.g. "Foundation Session 2". */
  context?: string;
  /** Overrides the reassurance line when "your work is saved" isn't true. */
  reassurance?: string;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept as console.error rather than a toast: this runs when the tree is
    // already broken, and a toast needs the tree.
    console.error(
      `[error-boundary]${this.props.context ? ` ${this.props.context}` : ''}`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950">
            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>

          <h2 className="text-lg font-semibold">This screen hit a problem</h2>

          <p className="mt-2 text-sm text-muted-foreground">
            {this.props.reassurance ??
              'Your conversation is saved — nothing you have written is lost. Reloading should bring it straight back.'}
          </p>

          <Button className="mt-6" onClick={() => window.location.reload()}>
            <RotateCw className="mr-2 h-4 w-4" />
            Reload
          </Button>

          {import.meta.env.DEV && (
            <pre className="mt-6 overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
