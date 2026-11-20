import { Component } from "react";
import { MemoryRouter } from "react-router-dom";
import { ErrorScreen } from "../PageScreens/PageScreens";

// The last line of defence: a render error anywhere below shows the Error screen instead of a blank page. It sits outside the app's router and
// providers, so the screen gets a MemoryRouter of its own (for its Home link) and both buttons reload the page, which also starts the app afresh. //
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <MemoryRouter>
        <ErrorScreen onRetry={() => window.location.reload()} onHome={(e) => { e.preventDefault(); window.location.assign("/"); }} />
      </MemoryRouter>
    );
  }
}
