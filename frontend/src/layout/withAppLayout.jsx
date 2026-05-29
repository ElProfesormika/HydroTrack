import { RouteErrorBoundary } from "../components/RouteErrorBoundary";
import { AppLayout } from "./AppLayout";

/** Enveloppe une page dashboard dans le shell + garde-fou d'erreur React. */
export function withAppLayout(Page) {
  function WrappedPage() {
    return (
      <AppLayout>
        <RouteErrorBoundary>
          <Page />
        </RouteErrorBoundary>
      </AppLayout>
    );
  }
  WrappedPage.displayName = `WithAppLayout(${Page.displayName || Page.name || "Page"})`;
  return WrappedPage;
}
