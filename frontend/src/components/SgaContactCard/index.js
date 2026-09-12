import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Typography, Button, Chip } from "@material-ui/core";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";

export default function SgaContactCard({ contactId, open }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let active = true;
    setRows([]);
    if (!open || !contactId) return undefined;
    api
      .get("/sga/status")
      .then(({ data }) => {
        if (data.enabled && data.syncedAt)
          return api.get("/sga/vehicles", {
            params: { contactId, limit: 100 }
          });
        return null;
      })
      .then(response => {
        if (active && response) setRows(response.data.rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [contactId, open]);
  if (!rows.length) return null;
  return (
    <div style={{ padding: 16 }}>
      <Typography variant="subtitle1">
        {i18n.t("sga.contactVehicles")}
      </Typography>
      {rows.map(row => (
        <Chip
          key={row.id}
          label={row.plate}
          size="small"
          style={{ margin: 3 }}
        />
      ))}
      <Button
        color="primary"
        component={Link}
        to={`/sga?contactId=${contactId}`}
      >
        {i18n.t("sga.seeAll")}
      </Button>
    </div>
  );
}
