import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="shipments-page" role="alert">
          <section className="page-error">
            <h1>This page could not be loaded</h1>
            <p>Please retry. Your shipment data has not been changed.</p>
            <button className="secondary-button" type="button" onClick={() => this.setState({ error: null })}>Retry</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
