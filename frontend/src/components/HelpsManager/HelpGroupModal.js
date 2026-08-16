import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  makeStyles
} from "@material-ui/core";

import { i18n } from "../../translate/i18n";
import IconPicker from "../IconPicker";
import { getIconComponent, DEFAULT_ICON } from "../IconPicker/icons";

const useStyles = makeStyles(theme => ({
  row: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2)
  },
  iconButton: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    width: 56,
    height: 56
  },
  field: {
    marginTop: theme.spacing(1)
  }
}));

const EMPTY = {
  title: "",
  subtitle: "",
  icon: DEFAULT_ICON,
  audience: "company",
  isActive: true
};

const HelpGroupModal = ({ open, group, onSave, onClose }) => {
  const classes = useStyles();
  const [values, setValues] = useState(EMPTY);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues(group ? { ...EMPTY, ...group } : EMPTY);
  }, [group, open]);

  const setField = (field, value) =>
    setValues(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(values);
    } finally {
      setSaving(false);
    }
  };

  const Icon = getIconComponent(values.icon);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {values.id
          ? i18n.t("helps.groupModal.editTitle")
          : i18n.t("helps.groupModal.addTitle")}
      </DialogTitle>
      <DialogContent>
        <Box className={classes.row}>
          <IconButton
            className={classes.iconButton}
            onClick={() => setPickerOpen(true)}
            title={i18n.t("helps.iconPicker.title")}
          >
            <Icon fontSize="large" />
          </IconButton>
          <TextField
            autoFocus
            fullWidth
            variant="outlined"
            margin="dense"
            label={i18n.t("helps.groupModal.title")}
            value={values.title}
            onChange={event => setField("title", event.target.value)}
          />
        </Box>

        <TextField
          fullWidth
          multiline
          minRows={2}
          variant="outlined"
          margin="dense"
          className={classes.field}
          label={i18n.t("helps.groupModal.subtitle")}
          value={values.subtitle || ""}
          onChange={event => setField("subtitle", event.target.value)}
        />

        <FormControl variant="outlined" margin="dense" fullWidth>
          <InputLabel id="help-group-audience">
            {i18n.t("helps.groupModal.audience")}
          </InputLabel>
          <Select
            labelId="help-group-audience"
            label={i18n.t("helps.groupModal.audience")}
            value={values.audience}
            onChange={event => setField("audience", event.target.value)}
          >
            <MenuItem value="company">
              {i18n.t("helps.audience.company")}
            </MenuItem>
            <MenuItem value="partner">
              {i18n.t("helps.audience.partner")}
            </MenuItem>
          </Select>
        </FormControl>

        <FormControlLabel
          control={
            <Switch
              checked={!!values.isActive}
              onChange={event => setField("isActive", event.target.checked)}
              color="primary"
            />
          }
          label={i18n.t("helps.active")}
        />

        <IconPicker
          open={pickerOpen}
          currentIcon={values.icon}
          onChange={icon => setField("icon", icon)}
          onClose={() => setPickerOpen(false)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="secondary" disabled={saving}>
          {i18n.t("helps.buttons.cancel")}
        </Button>
        <Button
          onClick={handleSave}
          color="primary"
          variant="contained"
          disabled={saving || !values.title.trim()}
        >
          {i18n.t("helps.buttons.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default HelpGroupModal;
