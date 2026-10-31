import React from "react";
import { Button, Typography } from "@material-ui/core";

import { i18n } from "../../translate/i18n";
import { isChunkLoadError } from "../../helpers/lazyWithReload";

const RouteFallback = () => (
  <div
    role="alert"
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      minHeight: "60vh",
      padding: 24,
      textAlign: "center"
    }}
  >
    <Typography variant="body1">{i18n.t("chunkError.message")}</Typography>
    <Button
      variant="contained"
      color="primary"
      onClick={() => window.location.reload()}
    >
      {i18n.t("chunkError.reload")}
    </Button>
  </div>
);

// Catches only chunk loading failures (a stale tab after a deploy, once the
// single automatic reload in lazyWithReload was already spent). Any other
// error is rethrown so the usual handlers still see it.
class ChunkErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (!isChunkLoadError(error)) throw error;
    const { fallback } = this.props;
    return fallback === undefined ? <RouteFallback /> : fallback;
  }
}

export default ChunkErrorBoundary;
